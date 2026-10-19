/* Preferences overlay: opening it never changes the terminal grid geometry. */
(() => {
  const settings = document.getElementById("workspaceSettings");
  const shell = document.querySelector(".studio-shell");
  const openers = [...document.querySelectorAll("[data-open-settings]")];
  if (!settings || !shell) return;
  let returnFocus = null;

  function closeSettings({ restoreFocus = true } = {}) {
    if (settings.hidden) return;
    hideMcpAgentMenu();
    settings.hidden = true;
    shell.inert = false;
    for (const opener of openers) opener.setAttribute("aria-expanded", "false");
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  }

  function openSettings(opener) {
    if (!settings.hidden) return;
    returnFocus = opener || document.activeElement;
    hideContextMenu();
    hideMcpAgentMenu();
    settings.hidden = false;
    shell.inert = true;
    for (const button of openers) button.setAttribute("aria-expanded", "true");
    settings.querySelector("button[data-settings-close]")?.focus();
  }

  for (const opener of openers) {
    opener.addEventListener("click", () => openSettings(opener));
  }

  settings.addEventListener("click", (event) => {
    if (event.target.closest("[data-settings-close]")) closeSettings();
    else if (event.target.closest("[data-settings-tool]")) {
      closeSettings({ restoreFocus: false });
    }
  });

  window.addEventListener("keydown", (event) => {
    if (settings.hidden) return;
    if (event.ctrlKey && event.shiftKey && event.code === "KeyL") {
      closeSettings({ restoreFocus: false });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (mcpAgentMenu && !mcpAgentMenu.hidden) hideMcpAgentMenu();
      else closeSettings();
      return;
    }
    if (event.key !== "Tab" || (mcpAgentMenu && !mcpAgentMenu.hidden)) return;
    const focusable = [...settings.querySelectorAll("button, select, input, [tabindex='0']")]
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, true);
})();
