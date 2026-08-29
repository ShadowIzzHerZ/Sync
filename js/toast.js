import { toastLifecycle } from "./animations.js";

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "toast-stack";
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

/**
 * @param {string} message
 * @param {"info"|"success"|"error"} kind
 */
export function showToast(message, kind = "info") {
  const stack = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${iconFor(kind)}</span>
    <span class="toast__message"></span>
  `;
  el.querySelector(".toast__message").textContent = message;
  stack.appendChild(el);

  toastLifecycle(el).then(() => el.remove());
}

function iconFor(kind) {
  if (kind === "success") return "✓";
  if (kind === "error") return "!";
  return "i";
}
