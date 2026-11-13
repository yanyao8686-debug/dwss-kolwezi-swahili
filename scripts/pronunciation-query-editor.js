/* DWSS 0.9.150 — read-only pronunciation lookup with scoped cleanup. */
(() => {
  "use strict";

  const GUARD = "__DWSS_PRONUNCIATION_QUERY_READONLY_0150__";
  if (window[GUARD]) return;
  window[GUARD] = true;

  const STYLE_ID = "dwss-pronunciation-query-readonly-0150";
  const REMOVE_SELECTORS = [
    ".pronunciation-hit-actions",
    ".dwss-query-inline-tools",
    ".dwss-query-inline-editor",
    ".dwss-query-edit-toggle"
  ].join(",");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    "#pronunciationResults .pronunciation-hit-reading,#pronunciationResults .pronunciation-hit-match,#pronunciationResults .pronunciation-hit-meta,#pronunciationResults .pronunciation-match-chip,#pronunciationResults .pronunciation-hit-actions,#pronunciationFrenchResults .pronunciation-hit-reading,#pronunciationFrenchResults .pronunciation-hit-meta:not(.pronunciation-hit-meaning),#pronunciationFrenchResults .pronunciation-match-chip,#pronunciationFrenchResults .pronunciation-hit-actions{display:none!important}",
    "#pronunciationFrenchResults .pronunciation-hit-meaning{display:block!important;margin:5px 0 0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--muted,#738195)!important;font-size:13px!important;font-weight:600!important;line-height:1.55!important}",
    "#pronunciationFrenchResults .pronunciation-hit-meaning strong{color:var(--muted,#738195)!important;font-weight:600!important}",
    "#pronunciationResults .dwss-query-inline-tools,#pronunciationResults .dwss-query-inline-editor,#pronunciationResults .dwss-query-edit-toggle,#pronunciationFrenchResults .dwss-query-inline-tools,#pronunciationFrenchResults .dwss-query-inline-editor,#pronunciationFrenchResults .dwss-query-edit-toggle{display:none!important}",
    "#pronunciation .pronunciation-maintenance-entry{display:none!important}"
  ].join("\n");

  function stripEditingControls(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll(REMOVE_SELECTORS).forEach(node => node.remove());
    root.querySelectorAll("[data-dwss-query-editor]").forEach(node => {
      node.removeAttribute("data-dwss-query-editor");
    });
  }

  function start() {
    if (document.head && !document.getElementById(STYLE_ID)) {
      document.head.appendChild(style);
    }
    const maintenance = document.querySelector("#pronunciation .pronunciation-maintenance-entry");
    if (maintenance) maintenance.remove();

    const roots = [
      document.getElementById("pronunciationResults"),
      document.getElementById("pronunciationFrenchResults")
    ].filter(Boolean);
    roots.forEach(root => stripEditingControls(root));

    // Observe only the two result lists. Main translation input/output DOM changes
    // must never trigger pronunciation-query cleanup work.
    if (typeof window.MutationObserver === "function") {
      roots.forEach(root => {
        const observer = new window.MutationObserver(() => stripEditingControls(root));
        observer.observe(root, { childList: true, subtree: true });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.DWSSPronunciationQueryReadOnly = Object.freeze({
    refresh() {
      stripEditingControls(document.getElementById("pronunciationResults"));
      stripEditingControls(document.getElementById("pronunciationFrenchResults"));
    }
  });
})();
