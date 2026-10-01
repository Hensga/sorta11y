/// <reference path="../../src/sorta11y.d.ts" />
// A classic <script> page: the UMD file puts `Sorta11y` on the window. This
// file has no import/export, so it is a script and sees the UMD global.

function enhance(el: HTMLUListElement): Sorta11y {
  const options: Sorta11y.Options = { handle: ".drag-handle" };
  return Sorta11y.create(el, options);
}

function order(list: Sorta11y): Sorta11y.Order {
  return list.toArray();
}
