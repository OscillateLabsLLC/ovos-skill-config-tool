/* OVOS/Neon Skill Configuration — small vanilla helpers.
   Theme + hide-empty preferences, and show/hide toggles for the
   server-rendered edit/add forms (htmx handles all requests). */
(function () {
  "use strict";

  var THEME_KEY = "theme-preference";
  var HIDE_KEY = "hide-empty-skills-preference";
  var root = document.documentElement;

  function applyTheme(dark) {
    root.classList.toggle("dark", dark);
  }

  // Initial theme: stored preference, else OS preference (with live follow)
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored ? stored === "dark" : media.matches);
  media.addEventListener("change", function (e) {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches);
  });

  // Initial hide-empty-skills state (default: false)
  document.body.classList.toggle(
    "hide-empty",
    localStorage.getItem(HIDE_KEY) === "true"
  );

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.dataset.action;

    if (action === "theme") {
      var dark = !root.classList.contains("dark");
      applyTheme(dark);
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } else if (action === "hide-empty") {
      var hide = document.body.classList.toggle("hide-empty");
      localStorage.setItem(HIDE_KEY, String(hide));
    } else if (action === "edit") {
      var node = btn.closest(".setting-node");
      node.querySelector(":scope > .edit-form").classList.toggle("hidden");
      node.querySelector(":scope > .setting-value").classList.toggle("hidden");
    } else if (action === "add") {
      var scope = btn.closest(".setting-node, .add-setting");
      var form = scope.querySelector(
        ":scope > .setting-children > .add-form, :scope > .add-form"
      );
      form.classList.toggle("hidden");
    } else if (action === "cancel") {
      var cancelForm = btn.closest("form");
      cancelForm.classList.add("hidden");
      cancelForm.reset();
      if (cancelForm.classList.contains("edit-form")) {
        cancelForm
          .closest(".setting-node")
          .querySelector(":scope > .setting-value")
          .classList.remove("hidden");
      }
    }
  });

  // Add-entry forms: swap the value control to match the selected type
  document.addEventListener("change", function (e) {
    var select = e.target.closest('[data-role="type-select"]');
    if (!select) return;
    var type = select.value;
    select.closest("form").querySelectorAll("[data-value]").forEach(function (el) {
      var kind = el.dataset.value;
      var show =
        (type === "boolean" && kind === "boolean") ||
        ((type === "object" || type === "array") && kind === "empty") ||
        ((type === "string" || type === "number") && kind === "text");
      el.hidden = !show;
      if (el.tagName !== "DIV") el.disabled = !show;
    });
  });
})();
