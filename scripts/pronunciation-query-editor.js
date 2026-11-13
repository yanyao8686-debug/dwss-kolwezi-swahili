/* DWSS 0.9.151 — read-only pronunciation lookup with complete results. */
(() => {
  "use strict";

  const GUARD = "__DWSS_PRONUNCIATION_QUERY_READONLY_0151__";
  if (window[GUARD]) return;
  window[GUARD] = true;

  const STYLE_ID = "dwss-pronunciation-query-readonly-0151";
  const REMOVE_SELECTORS = [
    ".dwss-query-inline-tools",
    ".dwss-query-inline-editor",
    ".dwss-query-edit-toggle"
  ].join(",");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    // Keep all useful reverse-lookup details visible in both languages.
    // Only editing controls are removed; copying a matched reading is read-only.
    "#pronunciationResults .pronunciation-hit-reading,#pronunciationResults .pronunciation-hit-match,#pronunciationResults .pronunciation-hit-meta,#pronunciationFrenchResults .pronunciation-hit-reading,#pronunciationFrenchResults .pronunciation-hit-meta{display:block!important;visibility:visible!important;opacity:1!important}",
    "#pronunciationResults .pronunciation-match-chip,#pronunciationFrenchResults .pronunciation-match-chip{display:inline-flex!important;visibility:visible!important;opacity:1!important}",
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
