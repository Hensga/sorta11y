/* ============================================================================
   sorta11y landing site — demo wiring.
   Each Playground block is a real Sorta11y.create()/.fromSelect() instance.
   Toggles rebuild the instance (destroy, then create with the new options);
   the black code panel is derived state, rendered from the current options.
   The visible "▸ spoken:" line and the black [sr] log panel both mirror the
   instance's ARIA live region for sighted users — the region itself still
   speaks for screen readers, so there is no double announcement.
   ========================================================================== */
(function () {
  "use strict";

  // --- tiny code "highlighter" (terminal-style ANSI-ish palette) --------
  function esc(s) {
    return s.replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  // Single-pass tokenizer: one alternation, first match wins, so a later token
  // class can never re-match markup an earlier pass injected (chained
  // .replace() calls corrupted their own output — the string rule matched the
  // "tok-com" class attribute the comment rule had just written).
  // Token kinds: comment, string, number, HTML tag name (after < or </),
  // property/attribute name (before : or =), API keyword/literal.
  function highlight(code) {
    return esc(code).replace(
      /(\/\/[^\n]*|&lt;!--[\s\S]*?--&gt;)|("[^"\n]*"|'[^'\n]*')|\b(\d+)\b|((?<=&lt;\/?)[A-Za-z][\w-]*)|([A-Za-z_$][\w-]*(?=\s*[:=]))|\b(Sorta11y|create|fromSelect|autoInit|true|false|null)\b/g,
      function (m, com, str, num, tag, prop) {
        var cls = com
          ? "tok-com"
          : str
            ? "tok-str"
            : num
              ? "tok-num"
              : tag
                ? "tok-tag"
                : prop
                  ? "tok-prop"
                  : "tok-key";
        return '<span class="' + cls + '">' + m + "</span>";
      },
    );
  }
  function setCode(id, code) {
    document.getElementById(id).innerHTML = highlight(code);
  }

  // === Sticky header vs. focus (WCAG 2.4.11 Focus Not Obscured) ==========
  (function () {
    var header = document.querySelector("body > header");
    if (!header) return;
    var root = document.documentElement;

    // The nav wraps onto up to four lines on narrow screens or with zoomed
    // text, so no fixed scroll-padding-top can clear it. Publish its real
    // height as --header-h (site.css derives scroll-padding-top from it) and
    // keep it current. Every scroll into view honours it: anchors, Tab, the
    // list taking focus on pick-up, and sorta11y keeping a moved item in view
    // (it scrolls the item's final position into view with block: "nearest").
    function syncHeaderHeight() {
      var h = Math.ceil(header.getBoundingClientRect().height);
      root.style.setProperty("--header-h", h + "px");
    }
    syncHeaderHeight();
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(syncHeaderHeight).observe(header);
    } else {
      window.addEventListener("resize", syncHeaderHeight);
    }
  })();

  // Mirror an instance's live region into the "▸ spoken:" line AND the black
  // [sr] log panel (last LOG_MAX announcements + blinking caret). Re-attachable
  // so a rebuild (destroy + recreate) points the observer at the new region —
  // the log history deliberately survives rebuilds.
  var LOG_MAX = 7;
  function makeMirror(spokenEl, logEl) {
    var obs = null;
    var lines = [];
    function render() {
      logEl.innerHTML =
        (lines.length ? lines.map(esc).join("\n") + "\n" : "") +
        '<span class="caret">▍</span>';
    }
    render();
    return function attach(inst) {
      if (obs) obs.disconnect();
      var region = inst && inst.liveRegion;
      if (!region) return;
      obs = new MutationObserver(function () {
        var t = region.textContent.trim();
        if (!t) return;
        spokenEl.textContent = t;
        lines.push("[sr] " + t);
        if (lines.length > LOG_MAX) lines = lines.slice(-LOG_MAX);
        render();
      });
      obs.observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    };
  }

  // Build <li> markup. handle=false → whole row is the grab target; handle=true
  // → a real focusable <button> handle (sorta11y gives it aria-pressed).
  function liMarkup(names, ids, handle, position) {
    return names
      .map(function (name, i) {
        var id = ids[i];
        if (!handle) {
          return (
            '<li data-id="' +
            id +
            '" data-label="' +
            name +
            '">' +
            name +
            "</li>"
          );
        }
        var btn =
          '<button type="button" class="drag-handle" aria-label="Move ' +
          name +
          '">⠿</button>';
        var inner = position === "right" ? name + btn : btn + name;
        return (
          '<li data-id="' +
          id +
          '" data-label="' +
          name +
          '" class="handle-' +
          (position || "left") +
          '">' +
          inner +
          "</li>"
        );
      })
      .join("");
  }

  // === Block A — Basic list · Sorta11y.create() ==========================
  (function () {
    var list = document.getElementById("a-list");
    var anim = document.getElementById("a-anim");
    var grab = document.getElementById("a-grab");
    var drag = document.getElementById("a-drag");
    var click = document.getElementById("a-click");
    var mirror = makeMirror(
      document.getElementById("a-spoken"),
      document.getElementById("a-log"),
    );
    var NAMES = [
      "Assign submissions",
      "Schedule sessions",
      "Check registration",
      "Publish programme",
      "Send invoices",
    ];
    var IDS = ["assign", "schedule", "check", "publish", "invoice"];
    var inst = null;

    function build() {
      if (inst) inst.destroy();
      list.innerHTML = liMarkup(NAMES, IDS, false);
      list.classList.toggle("slist--snappy", !anim.checked);

      var o = { animation: anim.checked ? 150 : 0 };
      if (grab.checked) o.grabbedClass = "is-held";
      if (drag.checked) o.draggingClass = "is-moving";
      if (!click.checked) o.clickToGrab = false;
      inst = Sorta11y.create(list, o);
      mirror(inst);

      var lines = ["Sorta11y.create(list, {"];
      lines.push("  animation: " + (anim.checked ? "150" : "0") + ",");
      if (grab.checked) lines.push('  grabbedClass: "is-held",');
      if (drag.checked) lines.push('  draggingClass: "is-moving",');
      if (!click.checked) lines.push("  clickToGrab: false,");
      lines.push("});");
      setCode("a-code", lines.join("\n"));
    }

    [anim, grab, drag, click].forEach(function (cb) {
      cb.addEventListener("change", build);
    });
    build();
  })();

  // === Block B — Drag handle · handle: "…" ===============================
  (function () {
    var list = document.getElementById("b-list");
    var on = document.getElementById("b-handle");
    var dragItem = document.getElementById("b-dragitem");
    var dragItemTouch = document.getElementById("b-dragitemtouch");
    var mirror = makeMirror(
      document.getElementById("b-spoken"),
      document.getElementById("b-log"),
    );
    var NAMES = [
      "Draft release notes",
      "Run axe-core in CI",
      "Verify focus order",
      "Test with NVDA",
      "Publish to npm",
    ];
    var IDS = ["draft", "axe", "focus", "nvda", "publish"];
    var inst = null;
    function build() {
      if (inst) inst.destroy();
      // dragOnItem is a library no-op without a handle, and dragOnItemTouch is
      // a no-op without dragOnItem — reflect both dependencies in the UI.
      dragItem.disabled = !on.checked;
      dragItemTouch.disabled = !on.checked || !dragItem.checked;
      list.innerHTML = liMarkup(NAMES, IDS, on.checked);
      var o = {};
      if (on.checked) {
        o.handle = ".drag-handle";
        if (dragItem.checked) {
          o.dragOnItem = true;
          if (dragItemTouch.checked) o.dragOnItemTouch = true;
        }
      }
      inst = Sorta11y.create(list, o);
      mirror(inst);
      var code;
      if (on.checked) {
        var lines = ["Sorta11y.create(list, {", '  handle: ".drag-handle",'];
        if (dragItem.checked) {
          lines.push("  dragOnItem: true,");
          if (dragItemTouch.checked) lines.push("  dragOnItemTouch: true,");
        }
        lines.push("});");
        code = lines.join("\n");
      } else {
        code =
          "Sorta11y.create(list, {\n  // no handle — the whole item is the grab target\n});";
      }
      setCode("b-code", code);
    }
    [on, dragItem, dragItemTouch].forEach(function (cb) {
      cb.addEventListener("change", build);
    });
    build();
  })();

  // === Block C — From <select multiple> · Sorta11y.fromSelect() ==========
  (function () {
    var select = document.getElementById("c-select");
    var handleOn = document.getElementById("c-handle");
    var mirror = makeMirror(
      document.getElementById("c-spoken"),
      document.getElementById("c-log"),
    );
    var NAMES = [
      "Accessibility",
      "Frontend",
      "Research",
      "Keynotes",
      "Workshops",
    ];
    var IDS = ["a11y", "fe", "research", "keynotes", "workshops"];
    var inst = null;

    select.innerHTML = NAMES.map(function (name, i) {
      return '<option value="' + IDS[i] + '" selected>' + name + "</option>";
    }).join("");

    function pos() {
      return document.querySelector('input[name="c-pos"]:checked').value;
    }
    function build() {
      if (inst) {
        var oldUl = inst.el;
        inst.destroy();
        oldUl.remove(); // fromSelect will insert a fresh <ul> in the select's place
      }
      inst = Sorta11y.fromSelect(select, {
        handle: handleOn.checked,
        handlePosition: pos(),
      });
      inst.el.classList.add("slist"); // give the library-built <ul> the card look
      // (list name comes from the select's aria-label — fromSelect forwards it)
      mirror(inst);
      var lines = ['Sorta11y.fromSelect("#groups", {'];
      lines.push("  handle: " + (handleOn.checked ? "true" : "false") + ",");
      if (handleOn.checked) lines.push('  handlePosition: "' + pos() + '",');
      lines.push("});");
      setCode("c-code", lines.join("\n"));
    }
    Array.prototype.forEach.call(
      document.querySelectorAll('input[name="c-pos"]'),
      function (r) {
        r.addEventListener("change", build);
      },
    );
    handleOn.addEventListener("change", build);
    build();
  })();

  // === Block D — Announcements & i18n · locale ===========================
  (function () {
    var list = document.getElementById("d-list");
    var mirror = makeMirror(
      document.getElementById("d-spoken"),
      document.getElementById("d-log"),
    );
    var enBtn = document.getElementById("d-en");
    var deBtn = document.getElementById("d-de");
    var NAMES = [
      "Opening keynote",
      "Accessibility panel",
      "Live captions",
      "Q & A",
      "Closing remarks",
    ];
    var IDS = ["keynote", "panel", "captions", "qa", "closing"];

    list.innerHTML = liMarkup(NAMES, IDS, true, "left");
    var inst = Sorta11y.create(list, { handle: ".drag-handle" });
    mirror(inst);

    function setLocale(loc, isDe) {
      inst.option("locale", loc); // null → built-in English; "de" → German
      // WCAG 3.1.2 (language of parts): the visible mirror, the live region and
      // the hidden keyboard instructions (each handle's aria-describedby) now
      // carry German text — mark them so screen readers switch voices. Set
      // "en" explicitly on the way back rather than relying on inheritance.
      var lang = isDe ? "de" : "en";
      document.getElementById("d-spoken").setAttribute("lang", lang);
      if (inst.liveRegion) inst.liveRegion.setAttribute("lang", lang);
      if (inst.instructions) inst.instructions.setAttribute("lang", lang);
      enBtn.classList.toggle("is-on", !isDe);
      deBtn.classList.toggle("is-on", isDe);
      enBtn.setAttribute("aria-pressed", isDe ? "false" : "true");
      deBtn.setAttribute("aria-pressed", isDe ? "true" : "false");
    }
    enBtn.addEventListener("click", function () {
      setLocale(null, false);
    });
    deBtn.addEventListener("click", function () {
      setLocale("de", true);
    });
  })();

  // === API / Quickstart panels (static, highlighted for consistency) =====
  setCode(
    "api-app",
    'Sorta11y.create(document.querySelector("#tasks"), {\n' +
      '  handle: ".drag-handle",\n' +
      "  onChange: (e) => save(e.order),\n" +
      "});\n\n" +
      "// or enhance every [data-sorta11y] list at once:\n" +
      "Sorta11y.autoInit();",
  );
  setCode(
    "api-html",
    '<link rel="stylesheet" href="sorta11y.css" />\n' +
      '<script src="sorta11y.js" defer></script>\n' +
      "\n" +
      '<ul id="tasks" data-sorta11y data-handle=".drag-handle"\n' +
      '    aria-label="Tasks">\n' +
      '  <li data-id="a">\n' +
      '    <button type="button" class="drag-handle"\n' +
      '            aria-label="Move Draft release notes">⠿</button>\n' +
      "    Draft release notes\n" +
      "  </li>\n" +
      "  <!-- … one <li data-id> per item -->\n" +
      "</ul>",
  );
})();
