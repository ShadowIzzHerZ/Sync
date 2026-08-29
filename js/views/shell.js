import { state, isStaffOrAdmin } from "../state.js";
import { signOut } from "../auth.js";
import { navigate } from "../router.js";
import { countPendingReports, onQueueChange } from "../offlineQueue.js";

export function renderShell(activeRoute, contentHtml) {
  const initials = initialsFor(state.profile);
  const roleBadge = isStaffOrAdmin()
    ? `<span class="role-pill role-pill--${state.profile.role}">${state.profile.role}</span>`
    : "";

  return `
    <div class="app-shell">
      <header class="topbar" data-animate>
        <div class="topbar__brand">
          <span class="topbar__mark" aria-hidden="true">Z</span>
          <span class="topbar__title">Zen</span>
        </div>
        <nav class="topbar__nav" aria-label="Primary">
          <a href="#/map" class="nav-link ${activeRoute === "map" ? "nav-link--active" : ""}">Map</a>
          <a href="#/reports" class="nav-link ${activeRoute === "reports" ? "nav-link--active" : ""}">My reports</a>
          <a href="#/feedback" class="nav-link ${activeRoute === "feedback" ? "nav-link--active" : ""}">Feedback</a>
        </nav>
        <div class="topbar__user">
          <span class="sync-pill" id="offline-pill" hidden>Offline</span>
          <span class="sync-pill sync-pill--pending" id="pending-pill" hidden></span>
          ${roleBadge}
          <button class="user-chip" id="user-menu-btn" aria-haspopup="true" aria-expanded="false">
            <span class="user-chip__avatar">${initials}</span>
            <span class="user-chip__email">${escapeHtml(state.profile?.display_name || state.profile?.email || "")}</span>
          </button>
          <div class="user-menu" id="user-menu" hidden>
            <div class="user-menu__email">${escapeHtml(state.profile?.email || "")}</div>
            <button class="user-menu__item" id="sign-out-btn">Sign out</button>
          </div>
        </div>
      </header>
      <main class="app-content" id="route-content">
        ${contentHtml}
      </main>
    </div>
  `;
}

export function wireShell(root) {
  const menuBtn = root.querySelector("#user-menu-btn");
  const menu = root.querySelector("#user-menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => {
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      menuBtn.setAttribute("aria-expanded", String(!isOpen));
    });
    document.addEventListener(
      "click",
      (e) => {
        if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) {
          menu.hidden = true;
          menuBtn.setAttribute("aria-expanded", "false");
        }
      },
      { capture: true },
    );
  }
  root.querySelector("#sign-out-btn")?.addEventListener("click", async () => {
    await signOut();
    navigate("/");
  });

  wireSyncIndicators(root);
}

// The shell is torn down and rebuilt wholesale on every route change (see
// router.js's `root.innerHTML = ...`), which would otherwise leak one more
// `window` listener + queue subscription per navigation. Tracking a single
// cleanup reference and calling it before attaching the next render's
// listeners keeps exactly one set alive at a time, without a
// whole-document MutationObserver to detect the teardown.
let cleanupSyncIndicators = null;

function wireSyncIndicators(root) {
  cleanupSyncIndicators?.();

  const offlinePill = root.querySelector("#offline-pill");
  const pendingPill = root.querySelector("#pending-pill");
  if (!offlinePill || !pendingPill) return;

  const updateOffline = () => {
    offlinePill.hidden = navigator.onLine;
  };
  const updatePending = async () => {
    const count = await countPendingReports();
    pendingPill.hidden = count === 0;
    pendingPill.textContent = count === 1 ? "1 report pending sync" : `${count} reports pending sync`;
  };

  updateOffline();
  updatePending();

  window.addEventListener("online", updateOffline);
  window.addEventListener("offline", updateOffline);
  const unsubscribeQueue = onQueueChange(updatePending);

  cleanupSyncIndicators = () => {
    window.removeEventListener("online", updateOffline);
    window.removeEventListener("offline", updateOffline);
    unsubscribeQueue();
  };
}

function initialsFor(profile) {
  const source = profile?.display_name || profile?.email || "?";
  return source.trim().slice(0, 1).toUpperCase();
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
