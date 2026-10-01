/*!
 * sorta11y — accessible, zero-dependency vanilla sortable list
 * @version 0.1.0-alpha.0
 * @license MIT
 * (c) 2026 Henning Huth · https://github.com/Hensga/sorta11y
 *
 * Reorder a single vertical list by keyboard (grab / move / drop with ARIA
 * live-region announcements and focus management) and by pointer or touch (drag,
 * with the displaced neighbours sliding via FLIP). Announcements are localisable.
 * Keyboard accessibility patterns were studied from @hello-pangea/dnd, SortableJS
 * and dragon-drop (all MIT — see NOTICE); all wording and code here are original.
 *
 * No build step: this hand-written UMD file is what ships. It attaches
 * `window.Sorta11y` in the browser and exports the same constructor under CJS.
 */
/* v8 ignore start -- UMD environment wrapper (boilerplate, host-bound branches) */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
    // Never runs: spells the exports out for Node's ESM loader, whose static
    // analysis can't see through the factory call — so named imports work
    // there as they do in bundlers.
    0 &&
      (module.exports = {
        version,
        locales,
        setDefaultLabels,
        create,
        get,
        autoInit,
        mirrorToSelect,
        fromSelect,
      });
  } else {
    root.Sorta11y = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* v8 ignore stop */
  "use strict";

  var VERSION = "0.1.0-alpha.0";

  var DRAG_THRESHOLD = 4; // px a pointer must travel before a press becomes a drag
  // px a noDrag body press may jitter and still count as a TAP. Deliberately
  // the platform's tap slop (~10px), NOT DRAG_THRESHOLD: browsers still
  // classify 4-9px of finger wobble as a click, so cancelling at 4px would
  // silently eat real taps (tremor input) on the very surface dragOnItem
  // enlarges for WCAG 2.5.7/2.5.8.
  var TAP_SLOP = 10;

  // ms past a slide's duration before its inline transition is dropped (see
  // releaseSlideLater) — slack for a late first frame, not a visible delay.
  var SLIDE_CLEANUP_GRACE = 50;

  // A click within this window after a pointerdown is treated as pointer-
  // originated (mouse/touch) and ignored by the keyboard-pickup path; a genuine
  // keyboard activation of a button has no recent pointerdown before it.
  var POINTER_CLICK_GUARD_MS = 700;

  var CLASS = {
    list: "s11y-list",
    item: "s11y-item",
    grabbed: "s11y-item--grabbed",
    dragging: "s11y-item--dragging",
    hidden: "s11y-visually-hidden",
    app: "s11y-app", // the role-less wrapper that carries role=application mid-grab
  };

  var DEFAULT_OPTIONS = {
    itemSelector: "> li",
    handle: null,
    keyboard: true,
    pointer: true, // enable the pointer/touch drag layer
    // Wrap the list in a role="application" region *during a keyboard grab* so
    // NVDA/JAWS pass Space/arrow keys through (their browse mode swallows them).
    // Engaged only while grabbing and removed on drop/cancel, so the idle list
    // stays fully readable. Browse-mode pickup needs a handle button.
    applicationRole: true,
    rtl: "auto",
    animation: 150, // FLIP slide duration in ms (0 disables)
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    announceTotal: true,
    liveness: "polite",
    dataIdAttr: "data-id",
    grabbedClass: null, // optional extra class on an item during a keyboard grab
    draggingClass: null, // optional extra class on an item during a pointer/touch drag
    clickToGrab: true, // pointer TAP (no drag) toggles grab like Space (WCAG 2.5.7); false = pointer can ONLY drag. Gates the tap only — a <button> handle's own keyboard activation still toggles (keeps WCAG 2.1.1)
    dragOnItem: false, // with a handle: POINTER drag/tap may also start anywhere on the item (bigger target, WCAG 2.5.8). Keyboard & screen-reader semantics stay on the handle — it remains the only tab stop and aria-pressed carrier — and presses on nested interactive controls keep their native behavior. No-op without a handle.
    dragOnItemTouch: false, // dragOnItem for direct-manipulation pointers (touch AND pen — CSS touch-action governs both). Off (default): the item body keeps its native touch-action so a long list still scrolls — TAPS on the body still pick up/place (a stationary tap never competes with a pan), but a touch/pen DRAG needs the handle. On: the whole item is a touch/pen drag surface (touch-action:none on every item — a scroll trap when the list fills the screen, so opt in only for short/unscrollable lists). The mouse always drags the whole item; decided per press via PointerEvent.pointerType, so hybrid devices get both.
    labels: null,
    locale: null,
    onChange: null,
    onStart: null,
    onEnd: null,
  };

  // Built-in default announcements (English). Other languages live as opt-in
  // files in src/locales/*.js and register on `Sorta11y.locales`. Each label is a
  // function so it can interpolate the position, pluralise, and phrase RTL text.
  // Each receives { itemLabel, position, total, announceTotal, order };
  // `position` is 1-indexed. A consumer's explicit `labels` option always wins
  // over the locale/default — see resolveLabels().
  function enPosition(c) {
    return c.announceTotal
      ? "Position " + c.position + " of " + c.total
      : "Position " + c.position;
  }

  function enName(c) {
    return c.itemLabel ? c.itemLabel + ", " : "";
  }

  var DEFAULT_LABELS = {
    // Accessible name for the role="application" wrapper engaged during a grab.
    // ARIA requires application regions to be named; this is used only when the
    // list itself carries neither aria-label nor aria-labelledby to mirror.
    applicationLabel: "Sortable list",
    instructions:
      "Sortable. Press Space to pick up, then the arrow keys to move, " +
      "Space to drop, Escape to cancel.",
    grabbed: function (c) {
      return (
        "Picked up. " +
        enName(c) +
        enPosition(c) +
        ". Use the arrow keys to move, Space to drop."
      );
    },
    moved: function (c) {
      return enPosition(c) + ".";
    },
    dropped: function (c) {
      return "Dropped. " + enName(c) + enPosition(c) + ".";
    },
    cancelled: function (c) {
      return (
        "Cancelled. " +
        (c.itemLabel ? c.itemLabel + " back at" : "Back at") +
        " " +
        enPosition(c) +
        "."
      );
    },
  };

  // Global default labels — English to start, swappable via Sorta11y.setDefaultLabels.
  var defaultLabels = DEFAULT_LABELS;

  // Module state ---------------------------------------------------------
  var instances = new WeakMap(); // element -> instance
  var currentGrab = null; // the single instance allowed to be grabbing
  var uid = 0; // unique id seed for the instructions element

  // Helpers --------------------------------------------------------------
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  function resolveItems(inst) {
    var el = inst.el;
    var sel = inst.options.itemSelector || "> li";
    if (sel.charAt(0) === ">") {
      var tail = sel.replace(/^>\s*/, "") || "*";
      return Array.prototype.filter.call(el.children, function (child) {
        return child.matches(tail);
      });
    }
    return Array.prototype.slice.call(el.querySelectorAll(sel));
  }

  // An element enhanced by a sorta11y instance (the registry, not the class
  // name, so a stale or look-alike class cannot fake one).
  function isSortableList(node) {
    return !!node && node.nodeType === 1 && instances.has(node);
  }

  // Bring the start order of a live grab/drag in line with a refreshed item
  // set: items that left drop out (a cancel restores this order, and must not
  // re-append a removed row), items that joined keep the position the app
  // gave them.
  function reconcileOrder(start, current) {
    var order = start.filter(function (it) {
      return current.indexOf(it) !== -1;
    });
    current.forEach(function (it, i) {
      if (order.indexOf(it) === -1)
        order.splice(Math.min(i, order.length), 0, it);
    });
    return order;
  }

  // Rearrange the DOM from `items` (current order) to `wanted`, moving as few
  // nodes as possible: every move detaches a row, restarting its CSS
  // animations and hover state. The longest run already in the wanted
  // relative order stays put; every other item is inserted before the next
  // item in `wanted`, or — at the tail — before whatever followed the last
  // item (so non-item children after the items keep their place).
  function placeInOrder(items, wanted, list) {
    var stays = longestIncreasingRun(
      wanted.map(function (it) {
        return items.indexOf(it);
      }),
    );
    var last = items[items.length - 1];
    var tailParent = last ? last.parentNode : list;
    var tail = last ? last.nextSibling : null;
    var next = null;
    for (var i = wanted.length - 1; i >= 0; i--) {
      if (!stays[i]) {
        if (next) next.parentNode.insertBefore(wanted[i], next);
        else tailParent.insertBefore(wanted[i], tail);
      }
      next = wanted[i];
    }
  }

  // The positions (as a lookup) of one longest strictly increasing run in
  // `seq` — O(n log n) patience sorting with back-links.
  function longestIncreasingRun(seq) {
    var tails = []; // tails[k]: index ending the smallest-tailed run of length k+1
    var back = [];
    for (var i = 0; i < seq.length; i++) {
      var lo = 0;
      var hi = tails.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (seq[tails[mid]] < seq[i]) lo = mid + 1;
        else hi = mid;
      }
      back[i] = lo > 0 ? tails[lo - 1] : -1;
      tails[lo] = i;
    }
    var run = {};
    var k = tails.length ? tails[tails.length - 1] : -1;
    for (; k !== -1; k = back[k]) run[k] = true;
    return run;
  }

  // An element's aria-labelledby, if it names anything: per the accname spec
  // it beats aria-label, but a reference to no existing element is ignored
  // (and aria-label applies) — so copying a dangling one would name nothing.
  function labelledByOf(el) {
    var ids = el.getAttribute("aria-labelledby");
    if (!ids || typeof document === "undefined") return null;
    var named = ids.split(/\s+/).some(function (id) {
      return !!id && !!document.getElementById(id);
    });
    return named ? ids : null;
  }

  function getGrabTarget(item, options) {
    if (options.handle) {
      var h = item.querySelector(options.handle);
      if (h) return h;
    }
    return item;
  }

  function getItemLabel(item, options) {
    var explicit =
      item.getAttribute("aria-label") || item.getAttribute("data-label");
    if (explicit) return explicit;
    var text = item.textContent || "";
    if (options.handle) {
      var h = item.querySelector(options.handle);
      if (h && h.textContent) text = text.replace(h.textContent, "");
    }
    return text.replace(/\s+/g, " ").trim();
  }

  // Accept an element or a selector string (resolved against the document).
  function toElement(target) {
    if (typeof target !== "string") return target;
    return typeof document !== "undefined"
      ? document.querySelector(target)
      : null;
  }

  function activeElement() {
    return typeof document !== "undefined" ? document.activeElement : null;
  }

  // Focus sits nowhere in particular: the browser dropped it to <body> (or
  // cleared it) because the focused node was detached or removed.
  function focusLost() {
    var active = activeElement();
    return !active || active === document.body;
  }

  // Whether a press landed on a scrollbar — such a press scrolls; it is no
  // tap on the page. The page's scrollbar lies beyond the viewport's client
  // area (the press targets the root element). A scroll container's lies in
  // the band between its client box and its border — measured exactly, so
  // a tap on the element's border is not taken for one (offsetX/Y count
  // from the padding edge, clientWidth/Height stop before the scrollbar).
  // Layout-less hosts (jsdom) report 0 sizes: never.
  function onScrollbar(e) {
    var t = e.target;
    if (!t || t.nodeType !== 1) return false;
    if (t === document.documentElement) {
      return (
        (t.clientWidth > 0 && e.clientX >= t.clientWidth) ||
        (t.clientHeight > 0 && e.clientY >= t.clientHeight)
      );
    }
    if (!t.clientWidth && !t.clientHeight) return false;
    var cs = window.getComputedStyle(t);
    var px = function (v) {
      return parseFloat(v) || 0;
    };
    var barX =
      t.offsetWidth -
      t.clientWidth -
      px(cs.borderLeftWidth) -
      px(cs.borderRightWidth);
    var barY =
      t.offsetHeight -
      t.clientHeight -
      px(cs.borderTopWidth) -
      px(cs.borderBottomWidth);
    return (
      (barX > 0 &&
        e.offsetX >= t.clientWidth &&
        e.offsetX < t.clientWidth + barX) ||
      (barY > 0 &&
        e.offsetY >= t.clientHeight &&
        e.offsetY < t.clientHeight + barY)
    );
  }

  // Whether focus sits on `el` or inside it.
  function holdsFocus(el) {
    var active = activeElement();
    return !!active && el.contains(active);
  }

  // Restore/move focus without scrolling: the element did not move on the
  // user's behalf, so the page must not jump to it.
  function focusQuietly(el) {
    if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
  }

  // An inline `transition` is ours only for the length of a slide: left
  // behind, it overrides the page's own CSS transitions on the item (a hover
  // fade, the held state's colour or shadow), which would then snap. Drop it
  // once the slide has had time to finish — together with the transform-immune
  // box cached for pointer swap detection while the row is in flight — unless
  // a newer slide on the same item has taken over by then (it re-stamps the
  // token).
  function releaseSlideLater(el, dur) {
    var token = {};
    el._s11ySlide = token;
    setTimeout(function () {
      if (el._s11ySlide !== token) return;
      el._s11ySlide = null;
      el._s11yRect = null; // landed — fall back to live rects
      if (el.style.transition.indexOf("transform") === 0) {
        el.style.transition = "";
      }
    }, dur + SLIDE_CLEANUP_GRACE);
  }

  // Scroll a moved item into view at its final position — minimally
  // ("nearest"), and honouring the page's scroll-padding (a sticky header)
  // and the item's scroll-margin, which a focus-scroll does not reliably do.
  // Guarded: jsdom and very old engines have no scrollIntoView.
  function revealItem(item) {
    if (item && typeof item.scrollIntoView === "function")
      item.scrollIntoView({ block: "nearest" });
  }

  function isModified(e) {
    return !!(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey);
  }

  // One "interactive" selector list shared by the keyboard and pointer paths
  // (they had drifted apart): nested controls keep their native behavior — a
  // keydown bubbling from one must not grab (WCAG 2.1.1), and a dragOnItem
  // press on one must not drag or tap-toggle.
  var INTERACTIVE_SELECTOR =
    "button, a[href], input, select, textarea, label, summary, " +
    "audio[controls], video[controls], " +
    "[contenteditable]:not([contenteditable='false']), " +
    "[role='button'], [role='link'], [role='textbox'], [role='searchbox'], " +
    "[role='checkbox'], [role='radio'], [role='switch'], [role='slider'], " +
    "[role='spinbutton'], [role='combobox'], [role='listbox'], " +
    "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], " +
    "[role='tab'], [role='option']";

  // Interactive descendants keep their native pointer behavior: with
  // dragOnItem, a press on a nested control (link, button, label, custom ARIA
  // widget…) must never start an item drag or toggle a grab. The handle itself
  // never reaches this check — a press on it resolves via _itemFromEventTarget
  // first.
  function isInteractiveNode(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      typeof node.matches === "function" &&
      node.matches(INTERACTIVE_SELECTOR)
    );
  }

  // True when an item's pickup is driven by a native <button> handle. Such a
  // button synthesises a click on Enter/Space activation — which reaches us even
  // in a screen reader's browse mode — so we defer to that click. A no-handle
  // item, or a non-<button> handle promoted with role="button", gets no synthetic
  // click and must therefore grab/drop straight from the keydown instead.
  function isClickPickup(item) {
    var grab = item && item._s11yGrab;
    return !!grab && grab !== item && grab.tagName === "BUTTON";
  }

  function normalizeKey(e) {
    var k = e.key;
    if (k === " " || k === "Spacebar" || e.code === "Space") return "SPACE";
    if (k === "Enter") return "ENTER";
    if (k === "ArrowUp") return "UP";
    if (k === "ArrowDown") return "DOWN";
    if (k === "Home") return "HOME";
    if (k === "End") return "END";
    if (k === "Escape" || k === "Esc") return "ESC";
    if (k === "Tab") return "TAB";
    return null;
  }

  function preventDefaultHandler(e) {
    e.preventDefault();
  }

  // Resolve an instance's labels. Precedence, low → high: built-in English <
  // global default (setDefaultLabels) < { locale: 'xx' } < explicit { labels }.
  // Missing keys always fall back, so a partial override is safe.
  function resolveLabels(options) {
    var o = options || {};
    var locale = o.locale && Sorta11y.locales[o.locale];
    return assign(
      {},
      DEFAULT_LABELS,
      defaultLabels,
      locale || null,
      o.labels || null,
    );
  }

  function prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // Constructor ----------------------------------------------------------
  function Sorta11y(target, options) {
    if (!(this instanceof Sorta11y)) return new Sorta11y(target, options);
    // A selector string resolves like fromSelect/mirrorToSelect do — but here
    // a miss throws: there is no list to enhance, and a silent null would
    // only fail later and further from the typo.
    var el = toElement(target);
    if (typeof target === "string" && !el) {
      throw new TypeError(
        'sorta11y: create("' + target + '") matched no element.',
      );
    }
    if (!el || el.nodeType !== 1) {
      throw new TypeError(
        "sorta11y: create(el) requires a DOM element or a selector.",
      );
    }
    var existing = instances.get(el);
    if (existing) return existing; // idempotent

    this.el = el;
    this.options = assign({}, DEFAULT_OPTIONS, options || {});
    this.labels = resolveLabels(options);
    this._grabbed = null;
    this._startItems = null;
    this._startIndex = -1;
    this._grabSource = null; // the input that picked the held item up
    this._addedListRole = false;
    this._appWrap = null; // permanent structural wrapper; role toggled per grab
    this._ptrStamp = null; // timeStamp of the last pointerdown (click disambiguation)
    this._ptrItem = null; // the item that pointerdown landed on (scopes the guard)
    this._autoCancelTypes = null;
    this._spaceKeyupGrab = null; // handle refocused by a Space-keydown drop (see _guardSpaceKeyup)
    this._spaceKeyupTimer = null;
    this._keyClickGrab = null; // <button> handle a Space/Enter keydown is about to click
    this._outsidePresses = null; // outside presses being judged during a tap hold
    this._destroyed = false;
    uid += 1;
    this._instructionsId = "s11y-instructions-" + uid;
    this._boundKeydown = this._onKeydown.bind(this);
    this._boundClick = this._onClick.bind(this);
    this._boundAutoCancel = this._onAutoCancel.bind(this);
    this._boundFocusOut = this._onFocusOut.bind(this);
    this._boundSpaceKeyupGuard = this._onSpaceKeyupGuard.bind(this);
    this._ptr = null;
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundPointerCancel = this._onPointerCancel.bind(this);
    this._boundPointerKeydown = this._onPointerKeydown.bind(this);
    this._boundPointerLostCapture = this._onPointerLostCapture.bind(this);
    this._boundPointerAbandon = this._onPointerAbandon.bind(this);

    this._init();
    instances.set(el, this);
  }

  Sorta11y.prototype = {
    constructor: Sorta11y,

    _init: function () {
      var el = this.el;
      var o = this.options;
      el.classList.add(CLASS.list);

      // One live region per instance, pre-inserted empty so the first
      // announcement is not swallowed. Polite throughout, atomic.
      this.liveRegion = document.createElement("div");
      this.liveRegion.className = CLASS.hidden;
      this.liveRegion.setAttribute("aria-live", o.liveness || "polite");
      this.liveRegion.setAttribute("aria-atomic", "true");
      this.liveRegion.setAttribute("role", "status");

      // Hidden instructions, referenced by each grab target's aria-describedby.
      this.instructions = document.createElement("div");
      this.instructions.id = this._instructionsId;
      this.instructions.className = CLASS.hidden;
      this._renderInstructions();

      if (el.parentNode) {
        el.insertAdjacentElement("afterend", this.liveRegion);
        this.liveRegion.insertAdjacentElement("afterend", this.instructions);
      } else if (typeof document !== "undefined" && document.body) {
        // Detached list: park the regions on <body> rather than inside the list,
        // where they would corrupt role="list" / native <ul> child semantics.
        document.body.appendChild(this.liveRegion);
        document.body.appendChild(this.instructions);
      } else {
        el.appendChild(this.liveRegion);
        el.appendChild(this.instructions);
      }

      // Container role: wrap in a (role-less) application region when the
      // keyboard layer wants one, else expose a list role on a non-native
      // container. Done after the regions are inserted so the wrapper can pull
      // them in right after the list.
      this._syncContainerRole();

      if (o.keyboard) {
        el.addEventListener("keydown", this._boundKeydown);
        // A handle button's activation fires a click that survives a screen
        // reader's browse mode — the pickup path a raw Space keydown cannot take.
        el.addEventListener("click", this._boundClick);
      }
      if (o.pointer) el.addEventListener("pointerdown", this._boundPointerDown);
      this.refresh();
    },

    // Render the hidden instructions text from the current labels. Extracted so
    // a live labels/locale swap can re-render it (else it stays in the language
    // it was first written in). A label may be a function or a plain string.
    _renderInstructions: function () {
      if (!this.instructions) return;
      var instr = this.labels.instructions;
      this.instructions.textContent =
        typeof instr === "function" ? instr({}) : instr || "";
    },

    // Container-role management ------------------------------------------
    // role="application" makes NVDA/JAWS enter focus mode so the grab keys reach
    // the widget. Per MDN it is scoped as small as possible, and per GitHub's
    // sortable pattern it is engaged only during an active grab — so a permanent,
    // role-less wrapper carries it and _setAppMode toggles the role, leaving the
    // idle list fully readable. It must not sit on the <ul> (invalid there, and
    // it strips the listitem semantics), hence the wrapper <div>.
    _syncContainerRole: function () {
      var o = this.options;
      if (o.keyboard && o.applicationRole) this._wrapApplication();
      else this._unwrapApplication();
      this._ensureListRole();
    },

    _ensureListRole: function () {
      var el = this.el;
      var nativeList = el.tagName === "UL" || el.tagName === "OL";
      if (!nativeList && !el.getAttribute("role")) {
        el.setAttribute("role", "list");
        this._addedListRole = true;
      }
    },

    _wrapApplication: function () {
      var el = this.el;
      if (this._appWrap || !el.parentNode) return;
      var wrap = document.createElement("div");
      wrap.className = CLASS.app;
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      // Keep the live region + instructions OUTSIDE the wrapper. The wrapper
      // carries role="application" for the whole grab, and a live region nested
      // in an active application region announces inconsistently across NVDA/JAWS
      // (see docs/at-test-matrix). Position them immediately AFTER the wrapper,
      // in [live, instructions] order, so they remain the wrapper's next siblings
      // and never its descendants. insertAdjacentElement moves them here whether
      // they were already el's siblings (attached init) or parked elsewhere (a
      // list initialised detached, then attached and refreshed).
      if (this.instructions && this.instructions.parentNode)
        wrap.insertAdjacentElement("afterend", this.instructions);
      if (this.liveRegion && this.liveRegion.parentNode)
        wrap.insertAdjacentElement("afterend", this.liveRegion);
      this._appWrap = wrap;
    },

    _unwrapApplication: function () {
      var wrap = this._appWrap;
      if (!wrap) return;
      var parent = wrap.parentNode;
      if (parent) {
        // Move the list back to the wrapper's slot; the live region +
        // instructions already sit AFTER the wrapper (never inside it), so
        // removing the now-empty wrapper leaves them right after the list.
        // Unless the page already took the list out (removed or moved it):
        // then only the wrapper goes — never resurrect a removed list.
        if (wrap.contains(this.el)) parent.insertBefore(this.el, wrap);
        parent.removeChild(wrap);
      }
      this._appWrap = null;
    },

    // Engage the application region for the duration of a grab (no-op when the
    // list is not wrapped, e.g. applicationRole:false or keyboard:false).
    _setAppMode: function (on) {
      var wrap = this._appWrap;
      if (!wrap) return;
      if (on) {
        wrap.setAttribute("role", "application");
        // ARIA requires an application region to be named. Mirror the list's own
        // name when it has one — in accname order: aria-labelledby (when it
        // references something), then aria-label — else fall back to the
        // localisable default label. The wrapper is entirely ours, so
        // setting/removing these attributes on it is always safe.
        var el = this.el;
        var labelledBy = labelledByOf(el);
        var ariaLabel = el.getAttribute("aria-label");
        if (labelledBy) {
          wrap.setAttribute("aria-labelledby", labelledBy);
        } else if (ariaLabel) {
          wrap.setAttribute("aria-label", ariaLabel);
        } else {
          var fallback = this.labels && this.labels.applicationLabel;
          if (typeof fallback === "function") fallback = fallback({});
          wrap.setAttribute("aria-label", fallback || "Sortable list");
        }
      } else {
        wrap.removeAttribute("role");
        wrap.removeAttribute("aria-label");
        wrap.removeAttribute("aria-labelledby");
      }
    },

    // Remove the grab-time tabindex from the list again — deferring while the
    // list still holds focus (dropping it to <body> would lose the user's
    // place; same shedding pattern as _cleanupItem). Only sheds what _grab
    // added, never a consumer's own tabindex.
    _shedListTabindex: function () {
      var el = this.el;
      if (!this._elTabAdded) return;
      var active = activeElement();
      if (active === el) {
        var shed = function () {
          el.removeAttribute("tabindex");
          el.removeEventListener("blur", shed);
        };
        el.addEventListener("blur", shed);
      } else {
        el.removeAttribute("tabindex");
      }
      this._elTabAdded = false;
    },

    // Re-resolve items and (re)apply ARIA + roving tabindex. Safe to re-run.
    refresh: function () {
      // Re-sync the container role/wrapper with the current options — this also
      // wraps a list that was created while detached and attached to the DOM
      // (then refreshed) afterwards. Idempotent: a no-op once already wrapped.
      this._syncContainerRole();
      var self = this;
      var o = this.options;
      var prev = this.items || [];
      this.items = resolveItems(this);
      var current = this.items;
      // If the grabbed item is about to leave the set, tear the grab down FIRST
      // — before _cleanupItem below strips its _s11yGrab — so a later
      // drop/cancel/destroy cannot throw on a missing grab target and strand
      // role="application". Done by reference; the departing element's own
      // attributes are cleaned by the loop below (we do not touch them here).
      var vanished = null;
      if (this._grabbed && current.indexOf(this._grabbed) === -1) {
        var gone = this._grabbed;
        vanished = {
          item: gone,
          oldIndex: this._startIndex,
          slot: prev.indexOf(gone), // where it sat when it vanished
          source: this._grabSource,
        };
        this._setAppMode(false); // release screen-reader focus mode up front
        this._removeAutoCancel();
        this._grabbed = null;
        this._startItems = null;
        this._startIndex = -1;
        if (currentGrab === this) currentGrab = null;
        this._stateClass(gone, CLASS.grabbed, this.options.grabbedClass, false);
      } else if (this._grabbed) {
        // The grab lives on, but other items came or went: a cancel restores
        // this start order, and must not re-append a row the app removed.
        this._startItems = reconcileOrder(this._startItems, current);
        this._startIndex = this._startItems.indexOf(this._grabbed);
      }
      // The same for a live pointer press/drag — whose own item may be gone.
      var ptr = this._ptr;
      var dragGone = null;
      var dragFocusSlot = -1; // where a vanished row's focus should go
      if (ptr && current.indexOf(ptr.item) === -1) {
        if (ptr.hadFocus) dragFocusSlot = prev.indexOf(ptr.item);
        dragGone = this._abandonDrag(ptr) ? ptr : null;
      } else if (ptr) {
        ptr.startItems = reconcileOrder(ptr.startItems, current);
        ptr.startIndex = ptr.startItems.indexOf(ptr.item);
      }
      // Strip ARIA/expandos from items that left the set, so the destroy
      // contract ("no orphaned attributes") holds for dynamic item sets too.
      prev.forEach(function (item) {
        if (current.indexOf(item) === -1) self._cleanupItem(item);
      });
      current.forEach(function (item) {
        var grab = getGrabTarget(item, o);
        item._s11yGrab = grab;
        // A non-<li> item without its own role becomes a listitem, so a
        // role="list" container (or the application wrapper) is never left with
        // zero listitems — this holds whether or not the item has a handle. A
        // native <li> already implies listitem and is left untouched.
        // _cleanupItem removes any role we added via _s11yRoleAdded.
        if (item.tagName !== "LI" && !item.getAttribute("role")) {
          item.setAttribute("role", "listitem");
          item._s11yRoleAdded = true;
        }
        // role=button + aria-pressed are only valid on a real button, so only a
        // handle (a child element) receives them. A no-handle <li> stays a
        // native listitem — role=button is not ARIA-valid on an <li> — and its
        // grab state is carried by the live region + the --grabbed class.
        if (grab !== item) {
          // A native <button> already exposes button semantics (and the click-
          // activation pickup needs a real button anyway — see README), so only
          // a non-button handle is promoted with an explicit role.
          if (
            grab.tagName !== "BUTTON" &&
            grab.getAttribute("role") !== "button"
          ) {
            grab.setAttribute("role", "button");
            grab._s11yRoleAdded = true;
          }
          // Preserve the pressed state if a refresh lands mid-drag.
          grab.setAttribute(
            "aria-pressed",
            self._grabbed === item ? "true" : "false",
          );
        }
        // aria-describedby points at the keyboard instructions, so it is only
        // truthful while the keyboard layer is on: a {keyboard:false} list must
        // not advertise "Press Space to pick up". (aria-keyshortcuts is not set
        // at all — those keys are operation keys, mostly no-ops when idle, and
        // the instructions element already conveys them per item.)
        if (o.keyboard)
          grab.setAttribute("aria-describedby", self._instructionsId);
        else grab.removeAttribute("aria-describedby");
        grab.setAttribute("draggable", "false");
        item.classList.add(CLASS.item);
        // Every item is its own tab stop: Tab/Shift+Tab move between items.
        grab.setAttribute("tabindex", "0");
        // Pointer drag needs the browser to not claim the gesture for scrolling.
        if (grab.style) grab.style.touchAction = o.pointer ? "none" : "";
        grab.removeEventListener("dragstart", preventDefaultHandler);
        grab.addEventListener("dragstart", preventDefaultHandler);
        // dragOnItem widens the pointer surface to the whole item. The item
        // opts out of native panning only when dragOnItemTouch ALSO asks for
        // full-surface touch drags: touch-action:none on every item turns a
        // full-screen list into a scroll trap (nothing left to pan on), so by
        // default the body keeps its native touch-action — touch/pen drags
        // stay on the handle, taps still work, and the mouse (the one pointer
        // touch-action does NOT govern — it governs pen too) drags the whole
        // item regardless. The native-dragstart suppression is needed either
        // way (a mouse drags the body even with the touch surface off). The
        // whole block is guarded by item !== grab:
        // in no-handle mode grab IS the item, and an unguarded
        // removeEventListener here would strip the suppression just added to
        // grab two lines above.
        if (item !== grab) {
          if (item.style)
            item.style.touchAction =
              o.pointer && o.dragOnItem && o.dragOnItemTouch ? "none" : "";
          item.removeEventListener("dragstart", preventDefaultHandler);
          if (o.dragOnItem)
            item.addEventListener("dragstart", preventDefaultHandler);
        }
      });
      // Finished only now, with the new items enhanced (a fresh item has no
      // grab target before the loop above).
      if (vanished) this._endVanishedGrab(vanished);
      // A dragged row that held focus took it along: hand it on, as above.
      if (dragFocusSlot !== -1 && focusLost()) this._focusSlot(dragFocusSlot);
      if (dragGone) {
        // A drag reported onStart, so it ends like a vanished keyboard grab.
        this._fire(
          "onEnd",
          this._evt(dragGone.item, dragGone.startIndex, -1, "pointer"),
        );
      }
      return this;
    },

    // Hand focus to the item now in a vanished item's slot: the next one,
    // else the new last (none left: nowhere to go).
    _focusSlot: function (slot) {
      var i = Math.min(slot, this.items.length - 1);
      if (i >= 0) focusQuietly(this.items[i]._s11yGrab);
    },

    // The item under a live pointer press/drag left the set (the app removed
    // or re-rendered it). Tear the gesture down WITHOUT _cancelPointer's
    // revert, which would re-append the departed row: drop the listeners and
    // the pointer capture, and — for a drag that had started — the single-
    // drag lock and the list's user-select. (A placement tap's lock belongs to
    // the held item, as in _cancelPointer; the row's own classes and styles go
    // with _cleanupItem.) Returns whether a started drag was ended.
    _abandonDrag: function (ptr) {
      this._removePointerListeners();
      this._ptr = null;
      try {
        if (ptr.grab && typeof ptr.grab.releasePointerCapture === "function")
          ptr.grab.releasePointerCapture(ptr.pointerId);
      } catch (err) {
        /* no capture held (e.g. released along with the removed node) */
      }
      if (ptr.dropTap || !ptr.started) return false;
      if (currentGrab === this) currentGrab = null;
      this.el.style.userSelect = "";
      return true;
    },

    // The held item left the set (the app removed or re-rendered it), so end
    // the grab the way a drop/cancel would — minus what needs the item. Focus
    // was parked on the list (or fell to <body> with the removed node): hand
    // it to the item now in the vanished one's slot (the next one, else the
    // new last), so the list's temporary tabindex can go at once instead of
    // stranding the user on a bare <ul>; a focus that already left the widget
    // is not stolen back. No dropped/cancelled announcement: the item is gone,
    // so both would announce a false outcome at a nonsense "position 0" — the
    // stale "Picked up…" text is cleared instead, the focus move announces
    // where the user is now, and why the item vanished is the app's to say.
    // onEnd reports newIndex -1 (no longer in the list); no onChange, since
    // no reorder was committed.
    _endVanishedGrab: function (vanished) {
      if (activeElement() === this.el || focusLost())
        this._focusSlot(vanished.slot);
      this._shedListTabindex();
      this.liveRegion.textContent = "";
      this._fire(
        "onEnd",
        this._evt(vanished.item, vanished.oldIndex, -1, vanished.source),
      );
    },

    // Remove every attribute, listener, class and expando this instance added
    // to an item. Shared by refresh() (for items leaving the set) and destroy().
    _cleanupItem: function (item) {
      var grab = item._s11yGrab;
      if (!grab) return;
      // dragOnItem additions live on the item itself — strip them so the
      // destroy contract ("no orphaned attributes/styles") holds.
      if (item !== grab) {
        if (item.style) item.style.touchAction = "";
        item.removeEventListener("dragstart", preventDefaultHandler);
      }
      ["aria-pressed", "aria-describedby", "draggable"].forEach(function (a) {
        grab.removeAttribute(a);
      });
      // Removing tabindex from the element that (or whose descendant) currently
      // holds focus would drop focus to <body>, losing the user's reading/tab
      // position on destroy()/refresh(). Anchor such a target at tabindex="-1"
      // (still programmatically focusable) and shed it on its next blur. A
      // native <button> stays focusable without tabindex, so just remove it.
      if (grab.hasAttribute("tabindex")) {
        if (holdsFocus(grab) && grab.tagName !== "BUTTON") {
          grab.setAttribute("tabindex", "-1");
          var shed = function () {
            grab.removeAttribute("tabindex");
            grab.removeEventListener("blur", shed);
          };
          grab.addEventListener("blur", shed);
        } else {
          grab.removeAttribute("tabindex");
        }
      }
      grab.removeEventListener("dragstart", preventDefaultHandler);
      if (grab._s11yRoleAdded) {
        grab.removeAttribute("role");
        delete grab._s11yRoleAdded;
      }
      if (item !== grab && item._s11yRoleAdded) {
        item.removeAttribute("role");
        delete item._s11yRoleAdded;
      }
      item.classList.remove(CLASS.item);
      this._stateClass(item, CLASS.grabbed, this.options.grabbedClass, false);
      this._stateClass(item, CLASS.dragging, this.options.draggingClass, false);
      if (grab.style) grab.style.touchAction = "";
      if (item.style) {
        item.style.transform = "";
        item.style.transition = "";
      }
      delete item._s11yGrab;
      delete item._s11yRect;
      // Void a pending slide cleanup (releaseSlideLater checks this token):
      // the item is released, so a transition the page sets later is its own.
      delete item._s11ySlide;
    },

    // Keyboard -----------------------------------------------------------
    _onKeydown: function (e) {
      var key = normalizeKey(e);
      if (!key) return;
      // During an active grab the whole list captures keys for the grabbed item,
      // so focus that strays onto nested content cannot escape (Tab stays
      // blocked, Esc still cancels). When idle, resolve the item the key belongs
      // to by walking up to the nearest *registered* grab target.
      if (this._grabbed) {
        this._handleGrabbedKey(e, key);
        return;
      }
      var item = this._itemFromEventTarget(e.target);
      if (!item) return;
      this._handleIdleKey(e, key, item);
    },

    // A handle is a real <button>; activating it with Enter/Space fires a click
    // even in a screen reader's browse mode, where a raw Space keydown never
    // reaches us. So the grab is toggled from the handle's click. `detail` does
    // NOT identify an activation: the browser's own keyboard activation is
    // detail 0, but an AT "press" (NVDA/JAWS browse mode) arrives with detail 1
    // — Blink prefixes it with a synthetic pointer tap, Gecko sends the bare
    // click (measured via AT-SPI, see docs/at-test-matrix.md). A click is
    // therefore treated as an activation unless recent pointer activity on the
    // same item explains it: a real mouse/touch click always follows its own
    // pointerdown/up, and Blink's synthetic AT tap is owned by the pointer
    // layer the same way.
    _onClick: function (e) {
      if (this._ptr) return;
      if (isModified(e)) return;
      var item = this._itemFromEventTarget(e.target);
      if (!item || item._s11yGrab === item) return; // no-handle pickup is on Space
      // The keyboard click an engine may fire on the keyup of the Space that
      // just dropped this item from the list (see _guardSpaceKeyup).
      if (this._spaceKeyupGrab === item._s11yGrab && e.detail === 0) {
        this._clearSpaceKeyupGuard();
        e.preventDefault();
        return;
      }
      // The button's own KEYBOARD activation: a detail-0 click right after a
      // Space/Enter keydown on this very button, with no pointer press in
      // between (_onPointerDown clears the mark). Neither pointer sequence
      // can produce that — a mouse/touch click has detail >= 1 and its own
      // pointerdown, Blink's AT tap starts with a synthetic pointerdown and
      // clicks with detail 1 — so it may pass the pointer guard below even
      // within its window (Space on the handle right after tapping it).
      var byKey = e.detail === 0 && this._keyClickGrab === item._s11yGrab;
      this._keyClickGrab = null;
      // Ignore the click a recent pointerdown/up on THIS SAME item synthesised
      // (mouse, touch, or Blink's AT tap); an activation on another item — or
      // with no pointer history — is genuine and must get through.
      if (
        !byKey &&
        this._ptrStamp != null &&
        this._ptrItem === item &&
        e.timeStamp - this._ptrStamp < POINTER_CLICK_GUARD_MS
      )
        return;
      e.preventDefault();
      if (this._grabbed === item) this._drop();
      else if (!this._grabbed) this._grab(item);
    },

    _handleIdleKey: function (e, key, item) {
      // No-handle mode: a keydown bubbling from a nested interactive control
      // (input, link, button, …) resolves to the item, which would let Space
      // grab the item and Enter get preventDefaulted — making that control
      // keyboard-inoperable while the mouse still works (a 2.1.1 failure). Defer
      // to the control instead. Handle mode is unaffected: only the handle's own
      // keydowns resolve to an item, so nested controls never reach here.
      if (
        item._s11yGrab === item &&
        e.target !== item &&
        e.target.closest &&
        e.target.closest(INTERACTIVE_SELECTOR)
      )
        return;
      // Tab/Shift+Tab move between items natively (every item is a tab stop), so
      // idle arrows/Home/End are left to the browser; only Space picks an item up.
      if (key === "SPACE") {
        if (isModified(e)) return; // modifiers abort the pickup
        if (e.repeat) {
          // A held key is ONE press. Its auto-repeat must not toggle again —
          // holding Space through a drop would re-grab — and preventing it
          // also keeps a repeat from arming a refocused button's native
          // activation. A button pressed here directly is already armed by
          // the first keydown, so its single click on release still comes.
          e.preventDefault();
          return;
        }
        // A native <button> handle activates on Space and fires its own click
        // (which reaches us in browse mode) — so defer to that. Everything else
        // (no-handle item, or a non-<button> handle) is grabbed from the keydown.
        if (isClickPickup(item)) {
          this._keyClickGrab = item._s11yGrab; // its click is keyboard-born
          return;
        }
        e.preventDefault();
        this._grab(item);
      } else if (key === "ENTER") {
        if (e.repeat) {
          e.preventDefault(); // a held Enter would re-activate the button per repeat
          return;
        }
        if (isClickPickup(item)) {
          this._keyClickGrab = item._s11yGrab; // native button: let Enter activate it
          return;
        }
        // A non-<button> handle promoted to role="button" is announced as a
        // button, so Enter must act like Space and grab it. A plain no-handle
        // <li> stays deliberately Enter-inert (never grabs, never submits).
        if (item._s11yGrab !== item) {
          e.preventDefault();
          this._grab(item);
          return;
        }
        e.preventDefault();
      }
    },

    _handleGrabbedKey: function (e, key) {
      var item = this._grabbed;
      if (isModified(e)) {
        e.preventDefault();
        this._cancel(false, true);
        if (key === "SPACE") this._guardSpaceKeyup(item);
        return;
      }
      // Holding Space/Enter is one press: its auto-repeat must not drop (and
      // then re-grab via the refocused handle). Prevented so a held Space does
      // not scroll the page. Arrow/Home/End repeats keep moving the item.
      if (e.repeat && (key === "SPACE" || key === "ENTER")) {
        e.preventDefault();
        return;
      }
      // A native <button> handle drops through its own click — but only when
      // the key actually lands ON that button (after a move, _reorder focuses
      // it): then a single Space/Enter is one toggle, its keydown here + the
      // ensuing click would otherwise both fire. Right after a pickup focus
      // sits on the LIST (see _grab), so the keydown comes from the <ul>, no
      // click follows it, and — like non-button handles and no-handle items,
      // which have no synthetic click — the keydown itself must drop.
      var clickToggle = isClickPickup(item) && e.target === item._s11yGrab;
      if (clickToggle && (key === "SPACE" || key === "ENTER"))
        this._keyClickGrab = item._s11yGrab; // its click is keyboard-born
      switch (key) {
        case "SPACE":
          if (clickToggle) return; // the button's click drops it
          e.preventDefault();
          this._drop();
          this._guardSpaceKeyup(item);
          break;
        case "ENTER":
          if (clickToggle) return; // let Enter activate the button (click → drop)
          // A handle — a <button> reached from the list, or a promoted
          // non-<button> — drops on Enter, mirroring Space. A plain no-handle
          // <li> stays Enter-inert (blocked) during the grab.
          if (item._s11yGrab !== item) {
            e.preventDefault();
            this._drop();
            break;
          }
          e.preventDefault(); // no-handle <li>: blocked during grab
          break;
        case "ESC":
          e.preventDefault();
          this._cancel(false, true);
          break;
        case "UP":
          e.preventDefault();
          this._moveBy(-1);
          break;
        case "DOWN":
          e.preventDefault();
          this._moveBy(1);
          break;
        case "HOME":
          e.preventDefault();
          this._moveTo(0);
          break;
        case "END":
          e.preventDefault();
          this._moveTo(this.items.length - 1);
          break;
        case "TAB":
          e.preventDefault(); // block focus escape while grabbed
          break;
        default:
          break;
      }
    },

    // A Space keydown that ended a <button>-handle grab has just refocused
    // that button (_drop/_cancel), and the key's keyup is still to come — on
    // the button. Chromium/WebKit only activate a button on a Space keyup
    // whose keydown armed it (:active), and current Gecko tracks the same
    // thing, but older Gecko activated on ANY Space keyup: that click would
    // re-grab the item the user just dropped. So swallow one keyboard click
    // (detail 0) on that button until the keyup has settled. Armed ONLY from
    // this keydown path, so a screen reader's browse-mode press (no keydown
    // reaches the page, and its click is detail 1 anyway) is never affected.
    _guardSpaceKeyup: function (item) {
      if (!isClickPickup(item)) return; // only a <button> synthesises clicks
      this._clearSpaceKeyupGuard();
      this._spaceKeyupGrab = item._s11yGrab;
      document.addEventListener("keyup", this._boundSpaceKeyupGuard, true);
      document.addEventListener("keydown", this._boundSpaceKeyupGuard, true);
    },

    _onSpaceKeyupGuard: function (e) {
      // A fresh press (e.g. a keyup lost to a window switch, then Space on the
      // button) owns its own click — stop guarding before it arrives.
      if (e.type === "keydown") {
        if (!e.repeat) this._clearSpaceKeyupGuard();
        return;
      }
      if (normalizeKey(e) !== "SPACE") return;
      // The engine dispatches its keyup activation right AFTER this event's
      // listeners, in the same task (a microtask would already be too late),
      // so hold the guard until the next task.
      document.removeEventListener("keyup", this._boundSpaceKeyupGuard, true);
      document.removeEventListener("keydown", this._boundSpaceKeyupGuard, true);
      var self = this;
      this._spaceKeyupTimer = setTimeout(function () {
        self._spaceKeyupTimer = null;
        self._clearSpaceKeyupGuard();
      }, 0);
    },

    _clearSpaceKeyupGuard: function () {
      if (this._spaceKeyupTimer != null) clearTimeout(this._spaceKeyupTimer);
      this._spaceKeyupTimer = null;
      this._spaceKeyupGrab = null;
      document.removeEventListener("keyup", this._boundSpaceKeyupGuard, true);
      document.removeEventListener("keydown", this._boundSpaceKeyupGuard, true);
    },

    // Toggle a state class on an item: the built-in hook plus an optional
    // consumer class (grabbedClass / draggingClass), which may be a space-
    // separated token list. Additive, so the library's own structural CSS on
    // the built-in class (z-index lift, reduced-motion) always still applies.
    _stateClass: function (item, builtin, custom, on) {
      var method = on ? "add" : "remove";
      item.classList[method](builtin);
      if (custom) {
        var toks = String(custom).split(/\s+/).filter(Boolean);
        if (toks.length) item.classList[method].apply(item.classList, toks);
      }
    },

    // Grab lifecycle -----------------------------------------------------
    // `source` is the input that picked the item up: "keyboard" (a key or a
    // handle activation, incl. a screen reader's) or "pointer" (a tap).
    _grab: function (item, source) {
      if (this._ptr) return; // a pointer drag is in progress on this list
      if (currentGrab && currentGrab !== this) currentGrab._abort(true); // single-drag-lock (silent)
      if (this._grabbed) return;
      this._grabbed = item;
      this._grabSource = source || "keyboard";
      this._startItems = this.items.slice(); // element refs — robust to missing/duplicate data-id
      this._startIndex = this.items.indexOf(item);
      currentGrab = this;
      var grab = item._s11yGrab;
      if (grab !== item) grab.setAttribute("aria-pressed", "true"); // handle only
      this._stateClass(item, CLASS.grabbed, this.options.grabbedClass, true);
      this._setAppMode(true); // screen-reader focus mode for the arrow keys
      this._addAutoCancel();
      // Move focus onto the LIST itself: a real, persistent focus change into
      // the fresh application region. Engines batch accessibility updates and
      // ship diffs, so a blur()+focus() of the same node nets out to nothing
      // and never reaches the screen reader (measured via AT-SPI) — only an
      // actual focus move survives the coalescing. The reader gets a focus
      // event inside role="application" and switches to focus mode; the arrow
      // keys keep working because during a grab the list-level keydown
      // handler drives the grabbed item regardless of the event's target.
      // Focus returns to the grab target on drop/cancel, where the temporary
      // tabindex is shed again.
      if (!this.el.hasAttribute("tabindex")) {
        this.el.setAttribute("tabindex", "-1");
        this._elTabAdded = true;
      }
      // Without scrolling: the held item is where the user already is, and a
      // jump would move a tapped handle out from under the pointer.
      focusQuietly(this.el);
      this._announce("grabbed", item);
      // Consumer code runs LAST, in every lifecycle step (here, _drop,
      // _cancel): the library's own state, focus and tabindex are settled
      // first, so a callback that throws cannot leave a half-done pickup —
      // or, on release, a stranded tabindex/focus — and its exception still
      // surfaces to the page untouched.
      this._fire(
        "onStart",
        this._evt(item, this._startIndex, this._startIndex, this._grabSource),
      );
    },

    // `source` is the input that committed the drop (default "keyboard").
    _drop: function (source) {
      var item = this._grabbed;
      if (!item) return; // nothing held (e.g. torn down by a refresh)
      var grab = item._s11yGrab;
      var oldIndex = this._startIndex;
      var newIndex = this.items.indexOf(item);
      // Release focus mode + the global auto-cancel listeners FIRST, so even a
      // throw on a stale/removed grab target below can never strand
      // role="application".
      this._setAppMode(false);
      this._removeAutoCancel();
      this._grabbed = null;
      if (currentGrab === this) currentGrab = null;
      this._stateClass(item, CLASS.grabbed, this.options.grabbedClass, false);
      if (grab && grab !== item) grab.setAttribute("aria-pressed", "false"); // handle only
      this._announce("dropped", item);
      // Focus back on the grab target — the second real focus move, now with
      // the application role gone, so the screen reader re-evaluates again.
      // Before the callbacks (see _grab), so a throwing one cannot strand the
      // list's tabindex — and a focus a callback moves elsewhere is kept. No
      // scroll: a drop moves nothing (each move already revealed the item).
      focusQuietly(grab);
      this._shedListTabindex();
      var evt = this._evt(item, oldIndex, newIndex, source);
      if (newIndex !== oldIndex) this._fire("onChange", evt);
      this._fire("onEnd", evt);
    },

    // `byKey`: the user cancelled from the keyboard (Escape / a modifier), as
    // opposed to an auto-cancel (a press elsewhere, wheel, resize, …).
    _cancel: function (silent, byKey) {
      if (!this._grabbed) return;
      var item = this._grabbed;
      var grab = item._s11yGrab;
      var startIndex = this._startIndex;
      // Release focus mode + auto-cancel listeners up front so a throw on a
      // stale/removed grab target below can never strand role="application".
      this._setAppMode(false);
      this._removeAutoCancel();
      this._grabbed = null;
      if (currentGrab === this) currentGrab = null;
      // Restore the original order by element reference (data-id may be absent
      // or duplicated, so we must not round-trip through it here).
      var parent = this.el;
      var startItems = this._startItems;
      var self = this;
      // A restore that moves the item slides it back to a slot that may be out
      // of view: on a keyboard cancel, reveal it there as a keyboard move does
      // (see _reorder). Never on an auto-cancel — scrolling then would move
      // the page under a pointer mid-click or fight a wheel — nor on a silent
      // one: the user's focus is elsewhere now.
      var restores =
        !!byKey &&
        startItems.some(function (it, i) {
          return self.items[i] !== it;
        });
      this._animateReorder(
        function () {
          startItems.forEach(function (it) {
            parent.appendChild(it);
          });
          self.items = startItems.slice();
        },
        null,
        restores ? item : null,
      );
      this._stateClass(item, CLASS.grabbed, this.options.grabbedClass, false);
      if (grab && grab !== item) grab.setAttribute("aria-pressed", "false"); // handle only
      var idx = this.items.indexOf(item);
      this._announce("cancelled", item);
      // Silent when a competing grab cancels this one. Never a focus-scroll:
      // after a reveal it would target the item's old, transformed spot, and
      // on an auto-cancel it would fight the wheel or press that caused it.
      if (grab && (restores || !silent)) focusQuietly(grab);
      this._shedListTabindex();
      // A cancel is no input of its own (Escape, a press elsewhere, focus
      // loss, another list's grab, …): it reports how the item was picked up.
      this._fire("onEnd", this._evt(item, startIndex, idx, this._grabSource)); // last (see _grab)
    },

    // Movement -----------------------------------------------------------
    _moveBy: function (delta) {
      var idx = this.items.indexOf(this._grabbed);
      var target = idx + delta;
      if (target < 0 || target >= this.items.length) {
        this._announce("moved", this._grabbed); // boundary: still give feedback
        return;
      }
      this._reorder(this._grabbed, target);
      this._announce("moved", this._grabbed);
    },

    _moveTo: function (target) {
      var idx = this.items.indexOf(this._grabbed);
      if (target === idx) {
        this._announce("moved", this._grabbed);
        return;
      }
      this._reorder(this._grabbed, target);
      this._announce("moved", this._grabbed);
    },

    _reorder: function (item, toIndex) {
      var order = this.items.slice();
      var from = order.indexOf(item);
      order.splice(from, 1);
      order.splice(toIndex, 0, item);
      var parent = this.el;
      var self = this;
      // Reveal the item at its new slot, then keep focus on it WITHOUT a
      // focus-scroll: by now FLIP holds it (by transform) at its OLD, still
      // visible spot, so the browser would compute that scroll against the
      // old position, scroll nothing, and let the item slide out of view —
      // past the viewport edge or under a sticky header.
      this._animateReorder(
        function () {
          order.forEach(function (it) {
            parent.appendChild(it); // moving an existing node keeps DOM + array in sync
          });
          self.items = order;
        },
        null,
        item,
      );
      focusQuietly(item._s11yGrab);
    },

    // Run a DOM change that re-appends items without losing the focus inside
    // the list. Moving a node with appendChild detaches it for a moment, and
    // the browser drops a focus it held to <body>: after a pointer swap, a
    // reverted drag or a sort() the keyboard user's place was gone, and mid-
    // grab the leaves-the-widget cancel (_onFocusOut) even reverted the
    // change. So remember the focused element and put it back — synchronously,
    // in the same task, so assistive technology sees no focus change at all
    // (engines coalesce a blur+refocus of one node into nothing) — only when
    // the change actually lost it, never fighting a focus that went elsewhere.
    // The keyboard _reorder/_cancel paths move focus explicitly instead.
    _keepFocus: function (mutate) {
      var active = activeElement();
      var held = active && this.el.contains(active) ? active : null;
      mutate();
      if (held && held.isConnected && focusLost()) focusQuietly(held);
    },

    // Where the list's scrollable content starts, in viewport coordinates. An
    // item's rect minus this is its position within the list — unchanged by
    // scrolling the page or the list itself.
    _contentOrigin: function () {
      var box = this.el.getBoundingClientRect();
      return {
        left: box.left - (this.el.scrollLeft || 0),
        top: box.top - (this.el.scrollTop || 0),
      };
    },

    // FLIP: measure positions, apply the DOM change, then animate EVERY displaced
    // item — the grabbed one and the neighbour it passes — from its old box to
    // its new one via `transform` (compositor-friendly). Honours
    // `prefers-reduced-motion` and `animation: 0`, and is a no-op without layout
    // (e.g. jsdom); the reorder itself is always applied synchronously.
    _animateReorder: function (mutate, skip, reveal) {
      var dur = this.options.animation;
      if (
        !dur ||
        prefersReducedMotion() ||
        typeof requestAnimationFrame === "undefined"
      ) {
        mutate();
        revealItem(reveal);
        return;
      }
      var els = this.items.slice();
      // First/Last are compared relative to the list's CONTENT origin (its box
      // minus its own scroll offset), not the viewport: the reveal scroll
      // between the two reads — of the page or of the list itself — must not
      // look like movement, or every item would slide by the scroll distance.
      var origin0 = this._contentOrigin();
      var firsts = els.map(function (el) {
        return el.getBoundingClientRect();
      });
      mutate();
      // Last must be each item's NATURAL new box. Moves can come faster than
      // the two frames below (a held arrow key), so an item may still carry
      // the previous move's inverse transform or be mid-slide — measured as
      // is, it would jump by that offset. Clearing the inline transform (and,
      // via transition:none, any running slide) first fixes that; First was
      // read above, so every slide still starts where the item visibly was.
      // Only rows a previous slide touched can be in flight — the rest keep
      // no inline transition, which would override the page's own CSS
      // transitions on them. Writes, then reads, then writes: one forced
      // layout, no thrashing.
      var halted = [];
      els.forEach(function (el) {
        if (el === skip) return; // e.g. the pointer-controlled dragged item
        if (!el.style.transform && !el.style.transition) return;
        el.style.transition = "none";
        el.style.transform = "";
        halted.push(el);
      });
      // Reveal the moved item at its FINAL spot, before the inverse
      // transforms put it back at the old one.
      revealItem(reveal);
      var origin1 = this._contentOrigin();
      var lasts = els.map(function (el) {
        return el === skip ? null : el.getBoundingClientRect();
      });
      var easing = this.options.easing || "ease";
      var moved = [];
      els.forEach(function (el, i) {
        if (el === skip) return;
        var first = firsts[i];
        var last = lasts[i];
        var dx = first.left - origin0.left - (last.left - origin1.left);
        var dy = first.top - origin0.top - (last.top - origin1.top);
        if (!dx && !dy) return; // unmoved (or no layout)
        // Cache the post-reorder, pre-transform (natural) box so pointer swap
        // detection reads a transform-immune position during the slide.
        el._s11yRect = last;
        el.style.transition = "none";
        el.style.transform = "translate(" + dx + "px, " + dy + "px)";
        moved.push(el);
      });
      // A row halted for the measurement that does not move now must not keep
      // `transition: none` (it would pin the page's CSS transitions off). The
      // reads above already applied its cleared transform, so this animates
      // nothing.
      halted.forEach(function (el) {
        if (moved.indexOf(el) === -1) el.style.transition = "";
      });
      if (!moved.length) return;
      // Play at once, in this task: flush the inverted state, then transition
      // back to rest. Waiting frames instead lets a held arrow key — faster
      // than two frames — re-measure the still-unmoved item on every press and
      // restart the wait: it froze (drifting off-screen as each reveal
      // scrolled on) and then jumped the whole distance. Same flush as
      // _cancelPointer's; one read covers every row.
      void moved[0].getBoundingClientRect();
      moved.forEach(function (el) {
        el.style.transition = "transform " + dur + "ms " + easing;
        el.style.transform = "";
        releaseSlideLater(el, dur); // also drops _s11yRect when it lands
      });
    },

    // Auto-cancel: any competing interaction abandons the keyboard drag.
    // (Plain 'scroll' is deliberately excluded — programmatic focus can scroll
    //  the page and would falsely cancel; 'wheel' covers intentional scrolling.)
    // A TAP pickup is spared wheel and resize: tap-to-place (WCAG 2.5.7) has to
    // scroll to reach a far target — with the wheel, or on mobile with a touch
    // scroll that collapses the URL bar and fires `resize`. A keyboard user has
    // the arrow keys instead, so for a keyboard grab scrolling away still ends
    // it. Focus loss and a hidden tab cancel either kind; a press outside
    // cancels a keyboard grab at once, a tap hold only once it proves to be a
    // tap (see _judgeOutsidePress) — so a touch scroll that STARTS outside
    // does not end it. A tap hold comes from Pointer Events, so it listens to
    // those alone: the mousedown/touchstart a press also fires are echoes of
    // the same gesture and must not cancel before it is judged.
    _addAutoCancel: function () {
      var self = this;
      var types;
      if (this._grabSource === "pointer") {
        types = ["pointerdown", "pointermove", "pointerup", "pointercancel"];
        this._outsidePresses = {}; // pointerId -> where an outside press began
      } else {
        types = ["pointerdown", "mousedown", "touchstart", "wheel", "resize"];
      }
      types.forEach(function (t) {
        var tgt = t === "resize" || t === "wheel" ? window : document;
        tgt.addEventListener(t, self._boundAutoCancel, true);
      });
      document.addEventListener(
        "visibilitychange",
        this._boundAutoCancel,
        true,
      );
      // Focus leaving the widget entirely (a dialog/toast/validation error
      // stealing it) must cancel the grab, else role="application"/aria-pressed
      // stay stuck and a later Space would drop the now-stale item. Bubbling
      // focusout on the list lets us see focus moving between items (which must
      // NOT cancel) versus out of the list (which must). See _onFocusOut.
      this.el.addEventListener("focusout", this._boundFocusOut);
      this._autoCancelTypes = types;
    },

    _removeAutoCancel: function () {
      var self = this;
      if (!this._autoCancelTypes) return;
      this._autoCancelTypes.forEach(function (t) {
        var tgt = t === "resize" || t === "wheel" ? window : document;
        tgt.removeEventListener(t, self._boundAutoCancel, true);
      });
      document.removeEventListener(
        "visibilitychange",
        this._boundAutoCancel,
        true,
      );
      this.el.removeEventListener("focusout", this._boundFocusOut);
      this._autoCancelTypes = null;
      this._outsidePresses = null;
    },

    _onAutoCancel: function (e) {
      // A press landing INSIDE this widget while it is grabbed is the user
      // reaching for the held item — to drop it with a tap (WCAG 2.5.7), or move
      // between its items — not a competing interaction, so it must not cancel.
      // The pointer path decides what that gesture means. Presses OUTSIDE the
      // widget, and non-press signals (tab-away / hidden; wheel / resize for a
      // keyboard grab — see _addAutoCancel), still abandon the grab.
      if (
        e &&
        (e.type === "pointerdown" ||
          e.type === "mousedown" ||
          e.type === "touchstart")
      ) {
        var t = e.target;
        if (t && this.el.contains(t)) return;
      }
      if (this._outsidePresses && e && /^pointer/.test(e.type)) {
        this._judgeOutsidePress(e);
        return;
      }
      this._cancel();
    },

    // A press outside the widget during a TAP hold is judged by how it ENDS.
    // Released in place — a tap or click elsewhere — it is the user letting go
    // of the hold: cancel. Taken over by the browser (pointercancel: a touch
    // scroll), moved beyond the tap slop, or on a scrollbar, it is scrolling
    // to reach a far drop target — which tap-to-place (WCAG 2.5.7) needs — so
    // the hold stays. Tracked per pointerId, so a second finger is judged on
    // its own; the map goes with the hold (_removeAutoCancel).
    _judgeOutsidePress: function (e) {
      var presses = this._outsidePresses;
      var id = e.pointerId;
      if (e.type === "pointerdown") {
        if (!onScrollbar(e)) presses[id] = { x: e.clientX, y: e.clientY };
        return;
      }
      var start = presses[id];
      if (!start) return; // a press that began inside, or on a scrollbar
      if (e.type === "pointermove") {
        if (
          Math.abs(e.clientX - start.x) >= TAP_SLOP ||
          Math.abs(e.clientY - start.y) >= TAP_SLOP
        )
          delete presses[id]; // scrolling (e.g. a scrollbar-thumb drag)
        return;
      }
      delete presses[id];
      if (e.type !== "pointerup") return;
      // A real tap outside releases the hold. The press is the user's: cancel
      // without the scrolling focus steal-back — on touch this runs BEFORE the
      // tap's compatibility mousedown/click, so scrolling back to the list here
      // would move the page under the finger and the click could miss. Only if
      // focus is left on the list itself (whose temporary tabindex the cancel
      // sheds) or fell to <body>, park it on the grab target, quietly.
      var grab = this._grabbed && this._grabbed._s11yGrab;
      this._cancel(true);
      if (grab && (focusLost() || activeElement() === this.el)) {
        focusQuietly(grab);
      }
    },

    // Cancel the grab when focus leaves the widget, but not when it moves
    // between items of the same list. Cancels silently (no focus steal-back) so
    // the element that took focus — a dialog, the next tab stop — keeps it.
    _onFocusOut: function (e) {
      var el = this.el;
      var related = e.relatedTarget;
      if (related) {
        // A known next focus target: cancel only if it is outside the widget.
        if (!el.contains(related)) this._cancel(true);
        return;
      }
      // relatedTarget is null (browsers often withhold it, and a bare blur has
      // none). Focus may still be settling — e.g. a reorder momentarily detaches
      // the grabbed node — so re-check on a microtask before cancelling.
      var self = this;
      Promise.resolve().then(function () {
        if (!self._grabbed) return; // already resolved elsewhere
        var active = activeElement();
        if (!active || !el.contains(active)) self._cancel(true);
      });
    },

    // Cancel whichever interaction is active (keyboard grab or pointer drag).
    _abort: function (silent) {
      if (this._grabbed) this._cancel(silent);
      else if (this._ptr) this._cancelPointer();
    },

    // Pointer / touch drag ------------------------------------------------
    // pointerdown on a grab target arms a drag; once past a small threshold the
    // item follows the pointer while neighbours FLIP-slide out of the way, and
    // pointerup commits through the same onChange/onEnd path as the keyboard.
    // Listeners live on `document` for the duration so the drag survives the
    // pointer leaving the element.
    _onPointerDown: function (e) {
      this._keyClickGrab = null; // pointer activity: clicks are the guard's again
      if (this._ptr) return;
      if (e.button != null && e.button !== 0) return; // primary button / touch only
      var item = this._itemFromEventTarget(e.target);
      // dragOnItem: with a handle configured, a press anywhere on the item body
      // may also start the POINTER interaction (drag, tap pickup, placement
      // tap). Keyboard and screen-reader semantics are untouched — the handle
      // stays the focusable, aria-pressed control — and _itemFromItemPress
      // bails on nested interactive controls.
      var fromBody = false;
      if (!item && this.options.dragOnItem) {
        item = this._itemFromItemPress(e.target);
        fromBody = !!item;
      }
      if (!item) return;
      // While an item is already held (keyboard/tap pickup), a press inside this
      // widget is a placement TAP, not a fresh drag: arm a "drop tap" whose
      // pointerup drops the held item (WCAG 2.5.7 single-pointer alternative).
      // Movement is ignored for it (see _onPointerMove) so it cannot fight the
      // held item, and it never starts a competing drag.
      var dropTap = !!this._grabbed;
      // Mark this press so the click it synthesises on touch — on THIS item — is
      // treated as pointer-born and ignored by the keyboard-pickup path. Scoped
      // to the item (and set only for a real primary press on one) so a keyboard
      // activation on a *different* item isn't swallowed by an earlier click, and
      // so the ghost click after a tap toggle cannot re-toggle the same item.
      this._ptrStamp = e.timeStamp;
      this._ptrItem = item;
      this._ptr = {
        item: item,
        grab: item._s11yGrab,
        startY: e.clientY,
        offset: e.clientY - item.getBoundingClientRect().top,
        dy: 0,
        started: false,
        dropTap: dropTap,
        // Without dragOnItemTouch the body keeps its native touch-action, so
        // the browser may claim a moving direct-manipulation pointer for
        // scrolling at any moment — and touch-action governs PEN as well as
        // touch in the major engines (Chromium pans with a stylus by default,
        // Apple Pencil scrolls). Such a press on the body may TAP but must
        // never turn into a drag (see _onPointerMove): starting one would
        // lift, snap back and announce a false "cancelled" the instant the
        // pan wins. Handle presses and the mouse are unaffected.
        noDrag:
          fromBody &&
          (e.pointerType === "touch" || e.pointerType === "pen") &&
          !this.options.dragOnItemTouch,
        startItems: this.items.slice(),
        startIndex: this.items.indexOf(item),
        pointerId: e.pointerId,
        // Whether the row holds focus — so a refresh() that removes it can
        // hand that focus on. Rechecked when the drag starts: the mousedown
        // after this pointerdown is what focuses a handle button.
        hadFocus: holdsFocus(item),
      };
      // Capture the pointer on the grab target so a release off-page/off-element
      // still reaches us; pair it with a lostpointercapture listener so a broken
      // capture tears the stuck drag down. Guarded for jsdom (no setPointerCapture)
      // and for a pointer that vanished before capture could be taken.
      try {
        if (
          item._s11yGrab &&
          typeof item._s11yGrab.setPointerCapture === "function"
        )
          item._s11yGrab.setPointerCapture(e.pointerId);
      } catch (err) {
        /* setPointerCapture can throw if the pointer is already gone — ignore */
      }
      document.addEventListener("pointermove", this._boundPointerMove, true);
      document.addEventListener("pointerup", this._boundPointerUp, true);
      document.addEventListener(
        "pointercancel",
        this._boundPointerCancel,
        true,
      );
      document.addEventListener(
        "lostpointercapture",
        this._boundPointerLostCapture,
        true,
      );
      document.addEventListener("keydown", this._boundPointerKeydown, true);
      // The safety net the keyboard grab has in _addAutoCancel: the window
      // losing focus (an alert(), an app switch) or the tab going hidden can
      // swallow the release — capture or not — and strand the drag. (A bubble
      // listener on window: element blurs do not bubble, so a swap that
      // re-appends the focused row cannot trip it.)
      window.addEventListener("blur", this._boundPointerAbandon);
      document.addEventListener("visibilitychange", this._boundPointerAbandon);
    },

    _onPointerAbandon: function () {
      this._cancelPointer();
    },

    _onPointerMove: function (e) {
      var ptr = this._ptr;
      if (!ptr || e.pointerId !== ptr.pointerId) return; // only the initiating pointer
      if (ptr.dropTap) return; // a placement tap on a held item never drags
      // A moving touch/pen on a scroll-enabled item body is a pan attempt
      // once it leaves the platform tap slop (and is no longer a tap): tear
      // the press down instead of starting a drag. On a scrollable page the
      // browser usually beats us to it with pointercancel; this branch covers
      // layouts with nothing left to scroll. TAP_SLOP, not DRAG_THRESHOLD —
      // see the constant.
      if (ptr.noDrag) {
        if (Math.abs(e.clientY - ptr.startY) >= TAP_SLOP) this._cancelPointer();
        return;
      }
      // A mouse/pen reporting no buttons held mid-move means its pointerup was
      // lost (released off-page): tear the stuck drag down rather than keep
      // reordering on hover. Touch never reports `buttons`, so this is pointer-
      // typed to avoid cancelling a normal touch drag.
      if (
        e.pointerType !== "touch" &&
        typeof e.buttons === "number" &&
        e.buttons === 0
      ) {
        this._cancelPointer();
        return;
      }
      if (!ptr.started) {
        if (Math.abs(e.clientY - ptr.startY) < DRAG_THRESHOLD) return;
        if (currentGrab && currentGrab !== this) currentGrab._abort(true); // single-drag-lock
        currentGrab = this;
        ptr.started = true;
        ptr.hadFocus = ptr.hadFocus || holdsFocus(ptr.item);
        this._stateClass(
          ptr.item,
          CLASS.dragging,
          this.options.draggingClass,
          true,
        );
        if (ptr.grab !== ptr.item)
          ptr.grab.setAttribute("aria-pressed", "true"); // handle only
        this.el.style.userSelect = "none";
        this._fire(
          "onStart",
          this._evt(ptr.item, ptr.startIndex, ptr.startIndex, "pointer"),
        );
      }
      if (e.cancelable) e.preventDefault();
      this._ptrMaybeSwap(e.clientY);
      // Keep the dragged item under the pointer, recomputed from its live layout
      // so it stays put even right after a DOM swap moved it to a new slot.
      var item = ptr.item;
      var rect = item.getBoundingClientRect();
      var naturalTop = rect.top - ptr.dy;
      ptr.dy = e.clientY - ptr.offset - naturalTop;
      item.style.transition = "none";
      item.style.transform = "translateY(" + ptr.dy + "px)";
    },

    // Swap as many times as the pointer position warrants (fast flicks can cross
    // several rows in one move). Neighbour positions are read transform-immune
    // (`_s11yRect` while a FLIP is mid-flight, else the live rect) so an
    // in-progress slide cannot make the comparison oscillate.
    _ptrMaybeSwap: function (clientY) {
      var item = this._ptr.item;
      var guard = this.items.length; // hard stop against any pathological loop
      while (guard-- > 0) {
        var idx = this.items.indexOf(item);
        var next = this.items[idx + 1];
        if (next) {
          var nr = next._s11yRect || next.getBoundingClientRect();
          if (clientY > nr.top + nr.height / 2) {
            this._ptrReorder(idx + 1);
            continue; // re-check from the new position
          }
        }
        var prev = this.items[idx - 1];
        if (prev) {
          var pr = prev._s11yRect || prev.getBoundingClientRect();
          if (clientY < pr.top + pr.height / 2) {
            this._ptrReorder(idx - 1);
            continue;
          }
        }
        break; // stable — no further swap warranted
      }
    },

    _ptrReorder: function (toIndex) {
      var item = this._ptr.item;
      var order = this.items.slice();
      var from = order.indexOf(item);
      order.splice(from, 1);
      order.splice(toIndex, 0, item);
      var parent = this.el;
      var self = this;
      // Animate the displaced neighbours, but skip the dragged item — it is
      // pointer-controlled and must not fight the FLIP transform. The swap
      // re-appends the dragged row, whose handle the mousedown just focused.
      this._keepFocus(function () {
        self._animateReorder(function () {
          order.forEach(function (it) {
            parent.appendChild(it);
          });
          self.items = order;
        }, item);
      });
    },

    _onPointerUp: function (e) {
      var ptr = this._ptr;
      if (!ptr || e.pointerId !== ptr.pointerId) return; // ignore other pointers
      // Re-stamp at release: the synthesised click follows the pointerUP, so a
      // press held longer than the guard window must not let its click through
      // _onClick as a fake keyboard/AT activation.
      this._ptrStamp = e.timeStamp;
      this._ptrFinish();
    },

    _onPointerCancel: function (e) {
      var ptr = this._ptr;
      if (!ptr || e.pointerId !== ptr.pointerId) return;
      this._cancelPointer();
    },

    _onPointerKeydown: function (e) {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        this._cancelPointer();
      }
    },

    _ptrFinish: function () {
      var ptr = this._ptr;
      if (!ptr) return;
      this._removePointerListeners();
      this._ptr = null;
      if (!ptr.started) {
        // A press that never crossed the drag threshold is a TAP — the single-
        // pointer, non-drag reorder alternative required by WCAG 2.5.7. It
        // toggles the same grab model the keyboard uses (pick up / drop / move-
        // then-drop). The click the browser synthesises next is pointer-born
        // and ignored by _onClick's recent-pointer guard, so a tap never
        // double-toggles.
        // clickToGrab gates this: when off the pointer is drag-only and the tap
        // is a no-op — and it must NOT clear currentGrab or disturb a held item.
        // A keyboard-held item (and the single-drag-lock) has to survive an
        // ignored tap; clearing the lock here would strand it (another list could
        // then grab without aborting it). So release the lock only on the paths
        // that actually end/replace the hold: the toggle branch and the drag.
        if (this.options.clickToGrab) {
          if (currentGrab === this) currentGrab = null;
          this._ptrTapToggle(ptr.item);
        }
        return;
      }
      if (currentGrab === this) currentGrab = null;
      var item = ptr.item;
      this._settle(item);
      this._stateClass(item, CLASS.dragging, this.options.draggingClass, false);
      if (ptr.grab !== ptr.item) ptr.grab.setAttribute("aria-pressed", "false"); // handle only
      this.el.style.userSelect = "";
      var oldIndex = ptr.startIndex;
      var newIndex = this.items.indexOf(item);
      // Announce the committed drag so screen-reader users get the same feedback
      // the keyboard path already gives — the README promises every change is
      // announced. The live region is visually hidden, so sighted mouse users
      // are unaffected.
      this._announce("dropped", item);
      var evt = this._evt(item, oldIndex, newIndex, "pointer");
      if (newIndex !== oldIndex) this._fire("onChange", evt);
      this._fire("onEnd", evt);
    },

    // A completed pointer TAP (no drag) toggles the grab model: pick up when
    // nothing is held, drop in place when the held item is tapped again, or move
    // the held item to a different tapped item's slot and drop. Reusing _grab /
    // _drop gives taps the same announcements, focus mode and callbacks as the
    // keyboard path — reported with source "pointer", as a drag is. Called from
    // _ptrFinish after _ptr is already cleared, so the _grab/_ptr guards do not
    // fire.
    _ptrTapToggle: function (item) {
      if (!this._grabbed) {
        this._grab(item, "pointer");
      } else if (this._grabbed === item) {
        this._drop("pointer");
      } else {
        // Another item is held: move it to the tapped item's slot, then drop.
        this._reorder(this._grabbed, this.items.indexOf(item));
        this._drop("pointer");
      }
    },

    // Losing the implicit pointer capture mid-drag is NOT fatal: pointermove /
    // pointerup / pointercancel are all bound on `document` (capture phase), so
    // they keep driving and terminating the drag with or without an active
    // capture. A swap re-inserts the dragged row via appendChild, and some
    // browsers release the capture when the captured node is momentarily
    // disconnected — cancelling here would end the drag after a single swap
    // (fine in a flat demo where the capture survives, broken once the list is
    // nested inside another layout). So keep going, and just re-assert capture
    // as a courtesy; real termination still comes from pointerup / pointercancel.
    _onPointerLostCapture: function (e) {
      var ptr = this._ptr;
      if (!ptr || e.pointerId !== ptr.pointerId || !ptr.started) return;
      try {
        if (
          ptr.grab &&
          ptr.grab.isConnected &&
          typeof ptr.grab.setPointerCapture === "function"
        ) {
          ptr.grab.setPointerCapture(e.pointerId);
        }
      } catch (err) {
        /* pointer already gone — document listeners still handle up/cancel */
      }
    },

    _cancelPointer: function () {
      var ptr = this._ptr;
      if (!ptr) return;
      this._removePointerListeners();
      this._ptr = null;
      // A torn-down placement tap (the browser claimed the touch for
      // scrolling, Esc, destroy, …) must not disturb the held item: the hold
      // and the single-drag-lock belong to the GRAB, not to this press —
      // mirroring _ptrFinish, where an ignored tap must not clear currentGrab
      // (clearing it here would let another list grab without aborting the
      // hold, co-holding two items).
      if (ptr.dropTap) return;
      if (currentGrab === this) currentGrab = null;
      // A press that never became a drag moved nothing: swaps only happen
      // after `started`, so the order still equals startItems and the item was
      // never lifted. Skip the restore/settle — re-appending identical items
      // would blur a focused handle (appendChild briefly disconnects it),
      // reset hover/CSS animations, force layout, and leave a stray inline
      // transition. This path now runs on EVERY touch scroll that starts on an
      // item body (pointerdown → browser claims the pan → pointercancel).
      if (!ptr.started) return;
      var item = ptr.item;
      var parent = this.el;
      var startItems = ptr.startItems;
      var self = this;
      // Where the item sits on screen right now (its lifted/dragged position).
      var visualTop = item.getBoundingClientRect().top;
      this._keepFocus(function () {
        self._animateReorder(function () {
          startItems.forEach(function (it) {
            parent.appendChild(it);
          });
          self.items = startItems.slice();
        }, item);
      });
      // The revert moved the item's slot; re-anchor its transform to the same
      // on-screen spot so the settle animates from where the finger left it.
      var naturalTop = item.getBoundingClientRect().top - ptr.dy;
      item.style.transition = "none";
      item.style.transform = "translateY(" + (visualTop - naturalTop) + "px)";
      // Flush: commit the re-anchor transform as the transition's START
      // value. Without a style/layout read the browser coalesces it with
      // _settle's writes below and the item snaps instead of gliding (the
      // handoff _animateReorder gets from its double rAF).
      void item.getBoundingClientRect();
      this._settle(item);
      this._stateClass(item, CLASS.dragging, this.options.draggingClass, false);
      if (ptr.grab !== ptr.item) ptr.grab.setAttribute("aria-pressed", "false"); // handle only
      this.el.style.userSelect = "";
      // Announce the aborted drag: the order was reverted above, so the item's
      // position now reads as its original slot. Matches the keyboard cancel
      // and keeps the README's "announces every change" promise honest.
      this._announce("cancelled", item);
      this._fire(
        "onEnd",
        this._evt(item, ptr.startIndex, this.items.indexOf(item), "pointer"),
      );
    },

    _removePointerListeners: function () {
      document.removeEventListener("pointermove", this._boundPointerMove, true);
      document.removeEventListener("pointerup", this._boundPointerUp, true);
      document.removeEventListener(
        "pointercancel",
        this._boundPointerCancel,
        true,
      );
      document.removeEventListener(
        "lostpointercapture",
        this._boundPointerLostCapture,
        true,
      );
      document.removeEventListener("keydown", this._boundPointerKeydown, true);
      window.removeEventListener("blur", this._boundPointerAbandon);
      document.removeEventListener(
        "visibilitychange",
        this._boundPointerAbandon,
      );
    },

    // Slide the lifted item back into its slot (instant under reduced-motion).
    _settle: function (item) {
      var dur = this.options.animation;
      if (!dur || prefersReducedMotion()) {
        item.style.transition = "";
        item.style.transform = "";
        return;
      }
      item.style.transition =
        "transform " + dur + "ms " + (this.options.easing || "ease");
      item.style.transform = "";
      releaseSlideLater(item, dur);
    },

    // Announcements ------------------------------------------------------
    _announce: function (kind, item) {
      var fn = this.labels[kind];
      if (!fn) return;
      var ctx = {
        itemLabel: getItemLabel(item, this.options),
        position: this.items.indexOf(item) + 1,
        total: this.items.length,
        announceTotal: this.options.announceTotal,
        order: this.toArray(),
      };
      var text = typeof fn === "function" ? fn(ctx) : String(fn);
      // Defuse identical consecutive text so the screen reader re-announces it.
      // NOTE: this synchronous clear-then-set is a baseline; some screen readers
      // coalesce both mutations and skip the repeat. A fully robust re-announce
      // (async gap or dual-region ping-pong) still needs validation against real
      // assistive technology.
      if (this.liveRegion.textContent === text)
        this.liveRegion.textContent = "";
      this.liveRegion.textContent = text;
    },

    // Events / callbacks -------------------------------------------------
    _evt: function (item, oldIndex, newIndex, source) {
      var idx = this.items.indexOf(item);
      return {
        item: item,
        oldIndex: oldIndex == null ? idx : oldIndex,
        newIndex: newIndex == null ? idx : newIndex,
        order: this.toArray(),
        source: source || "keyboard",
      };
    },

    _fire: function (name, evt) {
      var fn = this.options[name];
      if (typeof fn === "function") fn(evt);
    },

    // Resolve the owning item by walking ancestors and matching only against
    // *registered* grab targets — a stray nested [role="button"] is ignored
    // rather than swallowing the keystroke. The walk never climbs out of a
    // NESTED sorta11y list: in a no-handle outer list it would reach the outer
    // item holding it, and a key, press or click meant for the inner list (or
    // the drop keydown bubbling from the inner <ul>) would grab that too.
    _itemFromEventTarget: function (node) {
      while (node && node !== this.el) {
        for (var i = 0; i < this.items.length; i++) {
          if (this.items[i]._s11yGrab === node) return this.items[i];
        }
        if (isSortableList(node)) return null;
        node = node.parentNode;
      }
      return null;
    },

    // dragOnItem companion to _itemFromEventTarget: resolve a press on an
    // item's BODY (anywhere except its grab target, which the caller already
    // tried) to the item. Bails on any interactive element between the press
    // and the item so nested controls keep their native pointer behavior.
    _itemFromItemPress: function (node) {
      while (node && node !== this.el) {
        if (this.items.indexOf(node) !== -1) return node;
        if (isInteractiveNode(node)) return null;
        // Never walk out of a NESTED sorta11y list: a press inside it belongs
        // to that list, not to this item.
        if (isSortableList(node)) return null;
        node = node.parentNode;
      }
      return null;
    },

    // Public API ---------------------------------------------------------
    toArray: function () {
      var attr = this.options.dataIdAttr;
      return this.items.map(function (item) {
        return item.getAttribute(attr);
      });
    },

    sort: function (order, animate) {
      var attr = this.options.dataIdAttr;
      var self = this;
      var run = function () {
        var byId = {};
        self.items.forEach(function (item) {
          byId[item.getAttribute(attr)] = item;
        });
        var newItems = [];
        (order || []).forEach(function (id) {
          var item = byId[id];
          if (item && newItems.indexOf(item) === -1) newItems.push(item);
        });
        // Append any items not named in `order`, preserving them safely.
        self.items.forEach(function (item) {
          if (newItems.indexOf(item) === -1) newItems.push(item);
        });
        placeInOrder(self.items, newItems, self.el);
        self.items = newItems;
      };
      // A moved item is detached for a moment, which would drop its focus to
      // <body> — and mid-grab trip the leaves-the-widget cancel, reverting
      // this very sort.
      this._keepFocus(function () {
        if (animate === false) run();
        else self._animateReorder(run);
      });
      return this;
    },

    option: function (name, value) {
      if (arguments.length < 2) return this.options[name];
      this.options[name] = value;
      if (name === "liveness" && this.liveRegion) {
        this.liveRegion.setAttribute("aria-live", value);
      } else if (name === "labels" || name === "locale") {
        this.labels = resolveLabels(this.options);
        this._renderInstructions(); // re-render so the hidden text follows the swap
      } else if (name === "keyboard") {
        // Apply live: attach/detach the keydown + click handlers and the
        // application wrapper so the flag is truthful. Cancel any live grab first
        // so it cannot be left "held" with its focus-mode wrapper pulled away.
        if (this._grabbed) this._cancel();
        this.el.removeEventListener("keydown", this._boundKeydown);
        this.el.removeEventListener("click", this._boundClick);
        if (value) {
          this.el.addEventListener("keydown", this._boundKeydown);
          this.el.addEventListener("click", this._boundClick);
        }
        // refresh() re-syncs the container role AND the per-item ARIA, so
        // aria-describedby is added/removed to match the new keyboard flag.
        this.refresh();
      } else if (name === "applicationRole") {
        if (this._grabbed) this._cancel();
        this._syncContainerRole();
      } else if (name === "pointer") {
        // Attach/detach pointerdown and re-apply touch-action via refresh().
        if (this._ptr) this._cancelPointer();
        this.el.removeEventListener("pointerdown", this._boundPointerDown);
        if (value)
          this.el.addEventListener("pointerdown", this._boundPointerDown);
        this.refresh();
      } else if (
        name === "handle" ||
        name === "itemSelector" ||
        name === "dataIdAttr" ||
        name === "dragOnItem" || // re-apply the items' touch-action opt-out
        name === "dragOnItemTouch" // same: touch-action follows the pair
      ) {
        this.refresh(); // re-resolve items / grab targets for structural changes
      }
      return this;
    },

    destroy: function () {
      if (this._destroyed) return; // idempotent
      this._destroyed = true;
      if (this._grabbed) this._cancel();
      if (this._ptr) this._cancelPointer();
      this.el.removeEventListener("keydown", this._boundKeydown);
      this.el.removeEventListener("click", this._boundClick);
      this.el.removeEventListener("pointerdown", this._boundPointerDown);
      this._removeAutoCancel();
      this._clearSpaceKeyupGuard();
      var self = this;
      // Remember a focus inside the list: _cleanupItem anchors it at
      // tabindex="-1", but the _unwrapApplication reparent below still blurs it
      // to <body>, so we restore it afterwards.
      var active = activeElement();
      var refocus = active && this.el.contains(active) ? active : null;
      this.items.forEach(function (item) {
        self._cleanupItem(item);
      });
      this.el.classList.remove(CLASS.list);
      if (this._addedListRole) {
        this.el.removeAttribute("role");
        this._addedListRole = false;
      }
      if (this.liveRegion && this.liveRegion.parentNode) {
        this.liveRegion.parentNode.removeChild(this.liveRegion);
      }
      if (this.instructions && this.instructions.parentNode) {
        this.instructions.parentNode.removeChild(this.instructions);
      }
      this._unwrapApplication(); // return the list to its original parent
      // If the unwrap reparent dropped focus to <body>, put it back on the same
      // element so a keyboard user's reading position survives teardown. Guarded
      // to "focus was actually lost" so we never fight a consumer that moves
      // focus itself after destroy(). The _cleanupItem blur-shed already ran on
      // the reparent, so re-anchor a non-<button> target at tabindex="-1" (shed
      // again on its next blur) to keep it focusable.
      if (refocus && refocus.isConnected && typeof document !== "undefined") {
        if (focusLost() && typeof refocus.focus === "function") {
          if (
            refocus.tagName !== "BUTTON" &&
            !refocus.hasAttribute("tabindex")
          ) {
            refocus.setAttribute("tabindex", "-1");
            var shed = function () {
              refocus.removeAttribute("tabindex");
              refocus.removeEventListener("blur", shed);
            };
            refocus.addEventListener("blur", shed);
          }
          focusQuietly(refocus); // teardown moved nothing on the user's behalf
        }
      }
      instances.delete(this.el);
      if (currentGrab === this) currentGrab = null;
    },
  };

  // Static API -----------------------------------------------------------
  Sorta11y.version = VERSION;

  // Locale registry. The built-in English default is always available; other
  // languages register here when their src/locales/<code>.js file is loaded.
  Sorta11y.locales = { en: DEFAULT_LABELS };

  // Set the global default labels for instances created afterwards. Accepts a
  // labels object or the name of a registered locale (e.g. 'de').
  Sorta11y.setDefaultLabels = function (labelsOrLocale) {
    var labels =
      typeof labelsOrLocale === "string"
        ? Sorta11y.locales[labelsOrLocale]
        : labelsOrLocale;
    defaultLabels = assign({}, DEFAULT_LABELS, labels || null);
    return Sorta11y;
  };

  Sorta11y.create = function (el, options) {
    return new Sorta11y(el, options);
  };

  Sorta11y.get = function (el) {
    return instances.get(el) || null;
  };

  Sorta11y.autoInit = function (root) {
    var scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope) return [];
    var created = [];
    Array.prototype.forEach.call(
      scope.querySelectorAll("[data-sorta11y]"),
      function (el) {
        var opts = {};
        var handle = el.getAttribute("data-handle");
        if (handle) opts.handle = handle;
        var rtl = el.getAttribute("data-rtl");
        if (rtl) opts.rtl = rtl;
        var appRole = el.getAttribute("data-application-role");
        if (appRole === "false") opts.applicationRole = false;
        created.push(new Sorta11y(el, opts));
      },
    );
    return created;
  };

  // Progressive enhancement: mirror an onChange order into a hidden
  // `<select multiple>` so a normal (non-AJAX) form submit carries the new
  // order. Matches each item's data-id to an option's value and reorders the
  // option nodes. Accepts an event ({ order }) or a bare order array, and a
  // selector or a <select> element. Graceful no-op if either is missing.
  Sorta11y.mirrorToSelect = function (evt, select) {
    var el = toElement(select);
    var order = Array.isArray(evt) ? evt : evt && evt.order;
    if (!el || !order) return el || null;
    var byValue = {};
    Array.prototype.forEach.call(el.options, function (opt) {
      byValue[opt.value] = opt;
    });
    order.forEach(function (id) {
      var opt = byValue[id];
      if (opt) el.appendChild(opt); // move the existing node into the new order
    });
    return el;
  };

  // Give the generated list the name the <select> had, however the page named
  // it — else the list is announced unnamed. Precedence: an explicit `label`
  // option, then — in accname order — the select's aria-labelledby (copied as
  // a reference: the labelling elements stay in the DOM; ignored when it
  // references nothing), its aria-label, and the standard <label for> /
  // wrapping <label> (its text: that label would otherwise point at the
  // now-hidden select).
  function nameListLikeSelect(ul, select, explicit) {
    var labelledBy = !explicit && labelledByOf(select);
    if (labelledBy) {
      ul.setAttribute("aria-labelledby", labelledBy);
      return;
    }
    var name = explicit || select.getAttribute("aria-label");
    if (!name && select.labels && select.labels.length) {
      // A wrapping <label> contains the select itself — its option texts are
      // not part of the name, so read a copy without it.
      var copy = select.labels[0].cloneNode(true);
      Array.prototype.forEach.call(
        copy.querySelectorAll("select"),
        function (s) {
          s.parentNode.removeChild(s);
        },
      );
      name = (copy.textContent || "").replace(/\s+/g, " ").trim();
    }
    if (name) ul.setAttribute("aria-label", name);
  }

  // The mirror image of mirrorToSelect: build a sortable <ul> from a
  // `<select multiple>`, enhance it, and keep the (now hidden) select in sync so
  // a normal form submit still carries the order. This is the drop-in path for
  // apps that render a <select> rather than a server-side <ul> — the list is
  // constructed here (with correct listitem semantics and, by default, a handle
  // button for full screen-reader support) instead of the consumer hand-rolling
  // markup. Consumer-specific per-item styling stays out of the library: use the
  // `renderItem(li, option)` hook (e.g. to copy an option's colour onto its li).
  //
  // Options: everything create() accepts, plus:
  //   handle       — generate a handle <button> per item (default true; false =
  //                  the whole <li> is the grab target)
  //   handleClass  — class + selector for the generated handle (default s11y-handle)
  //   handleText   — the handle's visible glyph (default "⠿")
  //   handlePosition — "left" (default) or "right": which end of the row the
  //                  generated handle sits (DOM order; "right" reads content-
  //                  first and is easier to reach by thumb on touch). The button
  //                  also gets a `<handleClass>--left`/`--right` modifier class.
  //   handleLabel  — (text, option) => accessible name for the handle button
  //                  (default: the item text)
  //   renderItem   — (li, option) => void, called after each <li> is built
  //   keepSelected — keep every <option> selected so a plain submit carries them
  //                  all in order (default true)
  //   listClass    — class for the generated <ul>
  //   label        — aria-label for the <ul> (default: the select's own name —
  //                  see nameListLikeSelect)
  // Returns the Sorta11y instance (its `.el` is the new <ul>, `.sourceSelect`
  // the original select), or null if the target is not a <select>.
  Sorta11y.fromSelect = function (select, options) {
    var el = toElement(select);
    if (!el || el.tagName !== "SELECT" || typeof document === "undefined")
      return null;

    var o = options || {};
    var useHandle = o.handle !== false; // default: generate a handle button
    var handleClass = o.handleClass || "s11y-handle";
    var handleText = o.handleText != null ? o.handleText : "⠿";
    var handleRight = o.handlePosition === "right"; // default: left
    var keepSelected = o.keepSelected !== false; // default true

    var ul = document.createElement("ul");
    if (o.listClass) ul.className = o.listClass;
    nameListLikeSelect(ul, el, o.label);

    Array.prototype.forEach.call(el.options, function (opt) {
      if (keepSelected) opt.selected = true;
      var li = document.createElement("li");
      li.setAttribute("data-id", opt.value);
      var text = opt.textContent || "";
      if (useHandle) {
        var btn = document.createElement("button");
        btn.setAttribute("type", "button");
        btn.className =
          handleClass +
          " " +
          handleClass +
          "--" +
          (handleRight ? "right" : "left");
        btn.textContent = handleText;
        var alabel =
          typeof o.handleLabel === "function" ? o.handleLabel(text, opt) : text;
        if (alabel) btn.setAttribute("aria-label", alabel);
        // Position controls DOM order (= visual order in a plain LTR row):
        // "left" (default) = handle then text; "right" = text then handle, so
        // the grip sits at the row end — easier to reach by thumb on touch and
        // keeps the hand off the content.
        var textNode = document.createTextNode(text);
        if (handleRight) {
          li.appendChild(textNode);
          li.appendChild(btn);
        } else {
          li.appendChild(btn);
          li.appendChild(textNode);
        }
      } else {
        li.textContent = text;
      }
      if (typeof o.renderItem === "function") o.renderItem(li, opt);
      ul.appendChild(li);
    });

    // Hide the native select (still in the DOM, still submittable) and drop the
    // built list into its place.
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    if (el.parentNode) el.parentNode.insertBefore(ul, el);

    // Forward create() options, minus fromSelect's own keys; inject the handle
    // selector and an onChange that mirrors the order back into the select
    // (chaining a consumer onChange if one was supplied).
    var createOpts = assign({}, o);
    [
      "handle",
      "handleClass",
      "handleText",
      "handlePosition",
      "handleLabel",
      "renderItem",
      "keepSelected",
      "listClass",
      "label",
    ].forEach(function (k) {
      delete createOpts[k];
    });
    if (useHandle) createOpts.handle = "." + handleClass;
    var userOnChange = o.onChange;
    createOpts.onChange = function (evt) {
      Sorta11y.mirrorToSelect(evt, el);
      if (typeof userOnChange === "function") userOnChange(evt);
    };

    var inst = new Sorta11y(ul, createOpts);
    inst.sourceSelect = el;
    return inst;
  };

  return Sorta11y;
});
