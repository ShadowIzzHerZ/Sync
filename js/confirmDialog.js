import {
  openModalAnimation,
  closeModalAnimation,
  animateConfirmContents,
  pulseIcon,
  withTimeout,
} from "./animations.js";

/**
 * A small in-app replacement for window.confirm() — native confirm() looks
 * jarring against the rest of the UI, can't be styled, and is outright
 * suppressed in some embedded browser contexts. Destructive actions
 * (deleting a report) go through this instead.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title = "Are you sure?", message, confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    // Everything — icon, title, message, footer — lives inside the single
    // `.modal-body` so it all shares that one padded box; nothing sits
    // flush against the panel's edges.
    backdrop.innerHTML = `
      <div class="modal-panel modal-panel--confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="modal-body confirm-body">
          <div class="confirm-icon ${danger ? "confirm-icon--danger" : ""}" data-confirm-icon aria-hidden="true">
            ${danger ? "!" : "?"}
          </div>
          <h2 id="confirm-title" data-confirm-part>${title}</h2>
          <p class="confirm-message" data-confirm-part>${message}</p>
          <div class="modal-footer" data-confirm-part>
            <button type="button" class="btn btn--ghost" id="confirm-cancel">Cancel</button>
            <button type="button" class="btn ${danger ? "btn--primary btn--danger-solid" : "btn--primary"}" id="confirm-ok">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const panel = backdrop.querySelector(".modal-panel");
    const iconEl = backdrop.querySelector("[data-confirm-icon]");
    const partEls = backdrop.querySelectorAll("[data-confirm-part]");

    withTimeout(openModalAnimation(backdrop, panel).finished, 900).then(() => {
      animateConfirmContents(iconEl, partEls);
    });
    const pulse = pulseIcon(iconEl);

    const finish = async (result) => {
      pulse.pause();
      await closeModalAnimation(backdrop, panel);
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector("#confirm-cancel").addEventListener("click", () => finish(false));
    backdrop.querySelector("#confirm-ok").addEventListener("click", () => finish(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });
    document.addEventListener(
      "keydown",
      function onKey(e) {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey);
          finish(false);
        }
      },
      { once: true },
    );
  });
}
