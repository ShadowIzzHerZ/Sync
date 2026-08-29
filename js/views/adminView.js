import { state, setState } from "../state.js";
import {
  fetchReports,
  updateReportStatus,
  updateReportEta,
  fetchFeedback,
  updateMyCoverageLocation,
  subscribeToReportChanges,
} from "../api.js";
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
  const hasCoverage = state.profile?.coverage_lat != null && state.profile?.coverage_lng != null;
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
          <button class="btn btn--ghost btn--small" id="admin-coverage-btn">
            ${hasCoverage ? t("admin.coverage.update") : t("admin.coverage.set")}
          </button>
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
  root.querySelector("#admin-coverage-btn")?.addEventListener("click", () => setMyCoverageLocation(root));
}

function setMyCoverageLocation(root) {
  if (!navigator.geolocation) {
    showToast(t("report.toast.geoUnavailable"), "error");
    return;
  }
  const btn = root.querySelector("#admin-coverage-btn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = t("admin.coverage.locating");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { lat, lng } = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        await updateMyCoverageLocation(state.session.user.id, lat, lng);
        setState({ profile: { ...state.profile, coverage_lat: lat, coverage_lng: lng } });
        showToast(t("admin.coverage.saved"), "success");
        btn.textContent = t("admin.coverage.update");
      } catch (err) {
        showToast(err.message || t("admin.coverage.failed"), "error");
        btn.textContent = originalLabel;
      } finally {
        btn.disabled = false;
      }
    },
    () => {
      showToast(t("admin.coverage.failed"), "error");
      btn.disabled = false;
      btn.textContent = originalLabel;
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

export function renderAdminDashboard() {
  return `
    <div class="page" data-animate>
      <div class="page__header">
        <h1>${t("admin.dashboard.title")}</h1>
        <p class="page__subtitle">${t("admin.dashboard.subtitle")}</p>
      </div>

      <div class="admin-tabs" role="tablist">
        <button type="button" class="admin-tab admin-tab--active" id="admin-tab-reports" role="tab" aria-selected="true">${t("admin.tabs.reports")}</button>
        <button type="button" class="admin-tab" id="admin-tab-feedback" role="tab" aria-selected="false">${t("admin.tabs.feedback")}</button>
      </div>

      <section id="admin-panel-reports">
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
          <select id="admin-filter-assignment">
            <option value="all">${t("admin.dashboard.assignment.all")}</option>
            <option value="mine">${t("admin.dashboard.assignment.mine")}</option>
            <option value="unassigned">${t("admin.dashboard.assignment.unassigned")}</option>
          </select>
        </div>
        <div class="admin-report-grid" id="admin-report-grid"></div>
      </section>

      <section id="admin-panel-feedback" hidden>
        <div class="admin-feedback-grid" id="admin-feedback-grid"></div>
      </section>
    </div>
  `;
}

// Same problem shell.js's wireSyncIndicators solves, for the same reason:
// the admin dashboard is torn down and rebuilt wholesale on every visit to
// /admin, which would otherwise leak one more open realtime subscription
// per visit. Tracking a single cleanup reference and calling it before
// subscribing again keeps exactly one connection alive at a time.
let cleanupRealtime = null;

export async function wireAdminDashboard(root) {
  startRelativeTimeTicker();
  wireTabs(root);
  cleanupRealtime?.();

  const grid = root.querySelector("#admin-report-grid");
  const statsEl = root.querySelector("#admin-stats");
  const statusFilter = root.querySelector("#admin-filter-status");
  const categoryFilter = root.querySelector("#admin-filter-category");
  const assignmentFilter = root.querySelector("#admin-filter-assignment");

  let allReports = [];

  const applyFilters = () => {
    const status = statusFilter.value;
    const categoryId = categoryFilter.value;
    const assignment = assignmentFilter.value;
    const myId = state.session?.user?.id;
    const filtered = allReports.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (categoryId !== "all" && r.category?.id !== categoryId) return false;
      if (assignment === "mine" && r.assigned_staff_id !== myId) return false;
      if (assignment === "unassigned" && r.assigned_staff_id) return false;
      return true;
    });
    // Every report stays visible regardless of who it's assigned to —
    // "closer" only ever affects *ordering*, never visibility. Reports
    // assigned to this staff member (i.e. this staff member is nearest)
    // float to the top, then unassigned ones, then everyone else's —
    // newest-first within each group.
    filtered.sort((a, b) => {
      const priority = (r) => (r.assigned_staff_id === myId ? 0 : r.assigned_staff_id ? 2 : 1);
      const diff = priority(a) - priority(b);
      return diff !== 0 ? diff : new Date(b.created_at) - new Date(a.created_at);
    });
    renderStats(statsEl, allReports);
    renderGrid(grid, filtered, myId);
  };

  const loadReports = async ({ silent = false } = {}) => {
    try {
      allReports = await fetchReports();
      setState({ reports: allReports });
      applyFilters();
    } catch (err) {
      if (!silent) showToast(err.message || t("map.toast.loadFailed"), "error");
    }
  };

  statusFilter.addEventListener("change", applyFilters);
  categoryFilter.addEventListener("change", applyFilters);
  assignmentFilter.addEventListener("change", applyFilters);

  await loadReports();

  // Live updates: any insert/update/delete on `reports` (from any staff
  // member, or a citizen filing a new one) triggers a silent refetch —
  // reports are RLS-open and city-wide, so there's no per-row filtering to
  // do here, just "the list might be stale, get the current one."
  cleanupRealtime = subscribeToReportChanges((eventType) => {
    if (eventType === "INSERT") showToast(t("admin.dashboard.newReport"), "info");
    loadReports({ silent: true });
  });

  const feedbackGrid = root.querySelector("#admin-feedback-grid");
  try {
    const feedback = await fetchFeedback();
    renderFeedbackGrid(feedbackGrid, feedback);
  } catch (err) {
    showToast(err.message || t("admin.feedback.loadFailed"), "error");
  }
}

function wireTabs(root) {
  const tabReports = root.querySelector("#admin-tab-reports");
  const tabFeedback = root.querySelector("#admin-tab-feedback");
  const panelReports = root.querySelector("#admin-panel-reports");
  const panelFeedback = root.querySelector("#admin-panel-feedback");

  const activate = (tab) => {
    const showFeedback = tab === "feedback";
    panelReports.hidden = showFeedback;
    panelFeedback.hidden = !showFeedback;
    tabReports.classList.toggle("admin-tab--active", !showFeedback);
    tabFeedback.classList.toggle("admin-tab--active", showFeedback);
    tabReports.setAttribute("aria-selected", String(!showFeedback));
    tabFeedback.setAttribute("aria-selected", String(showFeedback));
  };

  tabReports.addEventListener("click", () => activate("reports"));
  tabFeedback.addEventListener("click", () => activate("feedback"));
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

function renderGrid(grid, reports, myId) {
  if (!reports.length) {
    grid.innerHTML = `<div class="empty-state"><p>${t("admin.dashboard.empty")}</p></div>`;
    return;
  }

  grid.innerHTML = reports
    .map((r) => {
      const isMine = r.assigned_staff_id === myId;
      const chipClass = isMine ? "assignment-chip--mine" : r.assigned_staff_name ? "" : "assignment-chip--unassigned";
      const chipLabel = isMine
        ? t("admin.dashboard.assignment.you")
        : r.assigned_staff_name || t("admin.dashboard.assignment.unassigned");
      return `
      <article class="admin-report-row ${isMine ? "admin-report-row--priority" : ""}" data-animate-item data-report-id="${r.id}">
        <img class="admin-report-row__photo" src="${r.photo_url}" alt="" loading="lazy" />
        <div class="admin-report-row__body">
          <div class="admin-report-row__top">
            <span class="category-chip">${escapeHtml(r.category?.name || "Uncategorized")}</span>
            <span class="badge badge--${r.status}">${t(`status.${r.status}`)}</span>
            ${r.severity_label ? `<span class="severity-pill severity-pill--${r.severity_label.toLowerCase()}">${tSeverity(r.severity_label)}</span>` : ""}
            <span class="assignment-chip ${chipClass}">${escapeHtml(chipLabel)}</span>
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
    `;
    })
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

function renderFeedbackGrid(grid, feedback) {
  if (!feedback.length) {
    grid.innerHTML = `<div class="empty-state"><p>${t("admin.feedback.empty")}</p></div>`;
    return;
  }

  grid.innerHTML = feedback
    .map((f) => {
      const who = f.user?.display_name || f.user?.email || t("admin.feedback.anonymous");
      const stars = f.rating ? "★".repeat(f.rating) + "☆".repeat(5 - f.rating) : "";
      return `
      <article class="admin-feedback-row" data-animate-item>
        <div class="admin-feedback-row__top">
          <span class="admin-feedback-row__who">${escapeHtml(who)}</span>
          ${stars ? `<span class="admin-feedback-row__stars" aria-label="${f.rating}/5">${stars}</span>` : ""}
          <time class="admin-feedback-row__time" datetime="${f.created_at}" title="${absoluteTimestamp(f.created_at)}">${timeAgo(f.created_at)}</time>
        </div>
        <p class="admin-feedback-row__message">${escapeHtml(f.message)}</p>
      </article>
    `;
    })
    .join("");

  animateListIn(grid);
}
