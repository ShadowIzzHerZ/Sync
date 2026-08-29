import { state, setState } from "../state.js";
import { fetchReports, updateReportStatus, updateReportEta } from "../api.js";
import { reverseGeocodeCoarse } from "../geocode.js";
import { showToast } from "../toast.js";
import { signOut } from "../auth.js";
import { navigate } from "../router.js";
import { timeAgo, absoluteTimestamp, startRelativeTimeTicker } from "../timeAgo.js";
import { animateListIn } from "../animations.js";
import { escapeHtml } from "./shell.js";
import { STATUSES } from "../config.js";
import { ETA_OPTIONS, etaKeyFor } from "../etaOptions.js";
import { t, tSeverity, renderLanguageSwitcher, wireLanguageSwitchers } from "../i18n.js";

export function renderAdminShell(contentHtml) {
  const initials = (state.profile?.display_name || state.profile?.email || "?").trim().slice(0, 1).toUpperCase();
  return `
    <div class="admin-shell">
      <header class="admin-topbar" data-animate>
        <div class="admin-topbar__brand">
          <span class="admin-topbar__badge" aria-hidden="true">Z</span>
          <div>
            <span class="admin-topbar__title">${t("admin.login.title")}</span>
            <span class="role-pill role-pill--${state.profile?.role}">${state.profile?.role}</span>
          </div>
        </div>
        <div class="admin-topbar__user">
          ${renderLanguageSwitcher()}
          <span class="admin-topbar__who">
            <span class="user-chip__avatar">${initials}</span>
            ${escapeHtml(state.profile?.display_name || state.profile?.email || "")}
          </span>
          <button class="btn btn--ghost btn--small" id="admin-sign-out-btn">${t("topbar.signOut")}</button>
        </div>
      </header>
      <main class="admin-content" id="admin-route-content">
        ${contentHtml}
      </main>
    </div>
  `;
}

export function wireAdminShell(root) {
  wireLanguageSwitchers(root);
  root.querySelector("#admin-sign-out-btn")?.addEventListener("click", async () => {
    await signOut();
    navigate("/admin/login");
  });
}

export function renderAdminDashboard() {
  return `
    <div class="page" data-animate>
      <div class="page__header">
        <h1>${t("admin.dashboard.title")}</h1>
        <p class="page__subtitle">${t("admin.dashboard.subtitle")}</p>
      </div>
      <div class="admin-stats" id="admin-stats"></div>
      <div class="filter-row">
        <select id="admin-filter-status">
          <option value="all">${t("map.filter.allStatuses")}</option>
          ${STATUSES.map((s) => `<option value="${s}">${t(`status.${s}`)}</option>`).join("")}
        </select>
        <select id="admin-filter-category">
          <option value="all">${t("map.filter.allCategories")}</option>
          ${state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="admin-report-grid" id="admin-report-grid"></div>
    </div>
  `;
}

export async function wireAdminDashboard(root) {
  startRelativeTimeTicker();

  const grid = root.querySelector("#admin-report-grid");
  const statsEl = root.querySelector("#admin-stats");
  const statusFilter = root.querySelector("#admin-filter-status");
  const categoryFilter = root.querySelector("#admin-filter-category");

  let allReports = [];

  const applyFilters = () => {
    const status = statusFilter.value;
    const categoryId = categoryFilter.value;
    const filtered = allReports.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (categoryId !== "all" && r.category?.id !== categoryId) return false;
      return true;
    });
    renderStats(statsEl, allReports);
    renderGrid(grid, filtered);
  };

  statusFilter.addEventListener("change", applyFilters);
  categoryFilter.addEventListener("change", applyFilters);

  try {
    allReports = await fetchReports();
    setState({ reports: allReports });
  } catch (err) {
    showToast(err.message || t("map.toast.loadFailed"), "error");
  }
  applyFilters();
}

function renderStats(el, reports) {
  const counts = { open: 0, in_progress: 0, resolved: 0 };
  reports.forEach((r) => {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  });
  el.innerHTML = `
    <div class="admin-stat">
      <span class="admin-stat__value">${counts.open}</span>
      <span class="admin-stat__label">${t("admin.dashboard.stats.open")}</span>
    </div>
    <div class="admin-stat">
      <span class="admin-stat__value">${counts.in_progress}</span>
      <span class="admin-stat__label">${t("admin.dashboard.stats.inProgress")}</span>
    </div>
    <div class="admin-stat">
      <span class="admin-stat__value">${counts.resolved}</span>
      <span class="admin-stat__label">${t("admin.dashboard.stats.resolved")}</span>
    </div>
  `;
}

function renderGrid(grid, reports) {
  if (!reports.length) {
    grid.innerHTML = `<div class="empty-state"><p>${t("admin.dashboard.empty")}</p></div>`;
    return;
  }

  grid.innerHTML = reports
    .map(
      (r) => `
      <article class="admin-report-row" data-animate-item data-report-id="${r.id}">
        <img class="admin-report-row__photo" src="${r.photo_url}" alt="" loading="lazy" />
        <div class="admin-report-row__body">
          <div class="admin-report-row__top">
            <span class="category-chip">${escapeHtml(r.category?.name || "Uncategorized")}</span>
            <span class="badge badge--${r.status}">${t(`status.${r.status}`)}</span>
            ${r.severity_label ? `<span class="severity-pill severity-pill--${r.severity_label.toLowerCase()}">${tSeverity(r.severity_label)}</span>` : ""}
          </div>
          <p class="admin-report-row__description">${escapeHtml(r.description)}</p>
          <div class="admin-report-row__meta">
            <span>${t("admin.dashboard.reporter")}: ${escapeHtml(r.reporter_display_name)}</span>
            <span aria-hidden="true">·</span>
            <time datetime="${r.created_at}" title="${absoluteTimestamp(r.created_at)}">${timeAgo(r.created_at)}</time>
          </div>
          <div class="admin-report-row__location" data-location-cell>
            <span class="admin-report-row__coords">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</span>
            <button type="button" class="btn btn--ghost btn--small" data-lookup-location data-lat="${r.lat}" data-lng="${r.lng}">
              ${t("admin.dashboard.location.lookup")}
            </button>
          </div>
          <div class="admin-report-row__controls">
            <label class="admin-report-row__control">
              <span class="admin-report-row__control-label">${t("admin.dashboard.status.label")}</span>
              <select class="status-select" data-report-id="${r.id}">
                ${STATUSES.map((s) => `<option value="${s}" ${s === r.status ? "selected" : ""}>${t(`status.${s}`)}</option>`).join("")}
              </select>
            </label>
            <label class="admin-report-row__control">
              <span class="admin-report-row__control-label">${t("admin.dashboard.eta.label")}</span>
              <select class="eta-select" data-report-id="${r.id}">
                ${ETA_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === r.eta_status ? "selected" : ""}>${t(o.key)}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
      </article>
    `,
    )
    .join("");

  animateListIn(grid);
  wireRowActions(grid);
}

function wireRowActions(grid) {
  grid.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await updateReportStatus(sel.dataset.reportId, sel.value);
        showToast(t("map.toast.statusUpdated"), "success");
      } catch (err) {
        showToast(err.message || t("map.toast.statusFailed"), "error");
      }
    });
  });

  grid.querySelectorAll(".eta-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await updateReportEta(sel.dataset.reportId, sel.value, state.session.user.id);
        showToast(t("admin.dashboard.eta.saved"), "success");
      } catch (err) {
        showToast(err.message || t("admin.dashboard.eta.failed"), "error");
      }
    });
  });

  grid.querySelectorAll("[data-lookup-location]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cell = btn.closest("[data-location-cell]");
      const coordsEl = cell.querySelector(".admin-report-row__coords");
      btn.disabled = true;
      btn.textContent = t("admin.dashboard.location.looking");
      const label = await reverseGeocodeCoarse(Number(btn.dataset.lat), Number(btn.dataset.lng));
      if (label) {
        coordsEl.textContent = label;
        btn.remove();
      } else {
        btn.disabled = false;
        btn.textContent = t("admin.dashboard.location.failed");
      }
    });
  });
}
