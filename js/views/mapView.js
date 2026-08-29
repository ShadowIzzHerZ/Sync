import { state, setState, isStaffOrAdmin } from "../state.js";
import { fetchReports, updateReportStatus, deleteReport, confirmReport } from "../api.js";
import { openReportModal } from "./reportModal.js";
import { confirmDialog } from "../confirmDialog.js";
import { showToast } from "../toast.js";
import { timeAgo, absoluteTimestamp, startRelativeTimeTicker } from "../timeAgo.js";
import { animateListIn, animateMarkerDrop } from "../animations.js";
import { escapeHtml } from "./shell.js";
import { STATUSES } from "../config.js";
import { t, tSeverity } from "../i18n.js";
import { etaKeyFor } from "../etaOptions.js";

let leafletMod = null;
let map = null;
let markerLayer = null;
let youAreHereMarker = null;
const markerByReportId = new Map();

// Confirmations this session has already sent, so the button doesn't
// invite a duplicate tap while its "already confirmed" state from a
// previous session isn't otherwise known client-side.
const confirmedByMe = new Set();

// Card actions (status change / delete / confirm) are wired from a
// module-level function that doesn't have closure access to the current
// `applyFilters` — this lets them trigger the same re-render/re-filter
// after mutating `state.reports`, instead of leaving the list showing
// stale data until the next unrelated re-render.
let refreshMapView = () => {};

const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 }; // fallback: New Delhi

export function renderMapView() {
  return `
    <div class="map-view" data-animate>
      <aside class="sidebar">
        <div class="sidebar__header">
          <h1>${t("map.sidebar.title")}</h1>
          <button class="btn btn--primary" id="new-report-btn">${t("map.newReport")}</button>
        </div>
        <div class="filter-row">
          <select id="filter-status">
            <option value="all">${t("map.filter.allStatuses")}</option>
            ${STATUSES.map((s) => `<option value="${s}">${t(`status.${s}`)}</option>`).join("")}
          </select>
          <select id="filter-category">
            <option value="all">${t("map.filter.allCategories")}</option>
            ${state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="report-list" id="report-list"></div>
      </aside>
      <div class="map-container" id="leaflet-map">
        <button type="button" class="recenter-btn" id="recenter-btn" title="${t("map.recenter")}" hidden>
          <span aria-hidden="true">◎</span>
        </button>
      </div>
    </div>
  `;
}

export async function wireMapView(root) {
  startRelativeTimeTicker();

  const listEl = root.querySelector("#report-list");
  const statusFilter = root.querySelector("#filter-status");
  const categoryFilter = root.querySelector("#filter-category");
  const newReportBtn = root.querySelector("#new-report-btn");

  await ensureMap(root.querySelector("#leaflet-map"));

  const applyFilters = () => {
    const status = statusFilter.value;
    const categoryId = categoryFilter.value;
    const filtered = state.reports.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (categoryId !== "all" && r.category?.id !== categoryId) return false;
      return true;
    });
    renderList(listEl, filtered);
    renderMarkers(filtered);
  };
  refreshMapView = applyFilters;

  statusFilter.addEventListener("change", applyFilters);
  categoryFilter.addEventListener("change", applyFilters);

  newReportBtn.addEventListener("click", async () => {
    const center = map.getCenter();
    const result = await openReportModal({ lat: center.lat, lng: center.lng });
    if (result?.ticket) {
      setState({ reports: mergeTicketIntoReports(state.reports, result.ticket) });
      applyFilters();
    }
    // result?.offline: queued for later sync — nothing to add to the map yet.
  });

  await refreshReports();
  applyFilters();

  async function refreshReports() {
    try {
      const reports = await fetchReports();
      setState({ reports, reportsLoadedAt: Date.now() });
    } catch (err) {
      showToast(err.message || t("map.toast.loadFailed"), "error");
    }
  }
}

function mergeTicketIntoReports(reports, ticket) {
  const idx = reports.findIndex((r) => r.cluster_id === ticket.cluster_id);
  if (idx === -1) return [ticket, ...reports];
  const next = [...reports];
  next[idx] = ticket;
  return next;
}

function renderList(listEl, reports) {
  if (!reports.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>${t("map.empty")}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = reports
    .map(
      (r) => `
      <article class="report-card" data-animate-item data-report-id="${r.id}" tabindex="0" role="button" aria-label="Show ${escapeHtml(r.category?.name || "Uncategorized")} report on the map">
        <img class="report-card__photo" src="${r.photo_url}" alt="" loading="lazy" />
        <div class="report-card__body">
          <div class="report-card__top">
            <span class="category-chip">${escapeHtml(r.category?.name || "Uncategorized")}</span>
            <span class="badge badge--${r.status}">${t(`status.${r.status}`)}</span>
          </div>
          ${renderSeverityAndCounts(r)}
          ${renderEtaChip(r)}
          <p class="report-card__description">${escapeHtml(r.description)}</p>
          <div class="report-card__meta">
            <span>${escapeHtml(r.reporter_display_name)}</span>
            <span aria-hidden="true">·</span>
            <time data-relative-time datetime="${r.created_at}" title="${absoluteTimestamp(r.created_at)}">${timeAgo(r.created_at)}</time>
          </div>
          ${renderCardActions(r)}
        </div>
      </article>
    `,
    )
    .join("");

  animateListIn(listEl);

  listEl.querySelectorAll(".report-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("select, button")) return;
      focusReportOnMap(card.dataset.reportId);
    });
    // The card carries tabindex="0" + role="button" so it's focusable, but
    // that alone doesn't make Enter/Space activate it the way a native
    // <button> would — without this, keyboard and switch-control users can
    // tab to a card and never actually open it.
    card.addEventListener("keydown", (e) => {
      if (e.target.closest("select, button")) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      focusReportOnMap(card.dataset.reportId);
    });
  });

  wireCardActions(listEl);
}

function renderSeverityAndCounts(report) {
  const severity = report.severity_label
    ? `<span class="severity-pill severity-pill--${report.severity_label.toLowerCase()}" title="Estimated from the photo, not measured">${tSeverity(report.severity_label)}</span>`
    : "";
  const duplicateCount = report.duplicate_count ?? 1;
  const confirmationCount = report.confirmation_count ?? 0;
  const counts = [];
  if (duplicateCount > 1) counts.push(t("map.reportedTimes", { count: duplicateCount }));
  if (confirmationCount > 0) {
    counts.push(t(confirmationCount === 1 ? "map.confirmations" : "map.confirmationsPlural", { count: confirmationCount }));
  }
  const countsText = counts.length ? `<span class="cluster-counts">${counts.join(" · ")}</span>` : "";
  if (!severity && !countsText) return "";
  return `<div class="report-card__signals">${severity}${countsText}</div>`;
}

/** A read-only "expected fix: 1–2 weeks" chip once staff have set one — visible to everyone, not just the reporter. */
function renderEtaChip(report) {
  const key = etaKeyFor(report.eta_status);
  if (!key) return "";
  return `<p class="eta-chip">${t("eta.cardLabel", { eta: t(key) })}</p>`;
}

function renderCardActions(report) {
  const isOwner = report.reporter_id === state.session?.user?.id;
  const canModerate = isStaffOrAdmin();

  const statusControl = canModerate
    ? `<select class="status-select" data-report-id="${report.id}">
         ${STATUSES.map((s) => `<option value="${s}" ${s === report.status ? "selected" : ""}>${t(`status.${s}`)}</option>`).join("")}
       </select>`
    : "";

  const deleteBtn =
    isOwner || canModerate
      ? `<button class="btn btn--ghost btn--small btn--danger" data-delete-id="${report.id}">${t("map.card.delete")}</button>`
      : "";

  const confirmBtn =
    report.status !== "resolved"
      ? `<button class="btn btn--ghost btn--small" data-confirm-id="${report.id}" ${confirmedByMe.has(report.id) ? "disabled" : ""}>
           ${confirmedByMe.has(report.id) ? t("map.card.confirmed") : t("map.card.stillIssue")}
         </button>`
      : "";

  if (!statusControl && !deleteBtn && !confirmBtn) return "";
  return `<div class="report-card__actions">${confirmBtn}${statusControl}${deleteBtn}</div>`;
}

function wireCardActions(listEl) {
  listEl.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async () => {
      try {
        const updated = await updateReportStatus(sel.dataset.reportId, sel.value);
        setState({
          reports: state.reports.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r)),
        });
        refreshMapView();
        showToast(t("map.toast.statusUpdated"), "success");
      } catch (err) {
        showToast(err.message || t("map.toast.statusFailed"), "error");
      }
    });
  });

  listEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmed = await confirmDialog({
        title: t("reports.confirm.title"),
        message: t("reports.confirm.message"),
        confirmLabel: t("reports.confirm.confirmLabel"),
        danger: true,
      });
      if (!confirmed) return;
      try {
        await deleteReport(btn.dataset.deleteId);
        setState({ reports: state.reports.filter((r) => r.id !== btn.dataset.deleteId) });
        refreshMapView();
        showToast(t("map.toast.deleted"), "success");
      } catch (err) {
        showToast(err.message || t("map.toast.deleteFailed"), "error");
      }
    });
  });

  listEl.querySelectorAll("[data-confirm-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleConfirmClick(btn.dataset.confirmId);
    });
  });
}

async function handleConfirmClick(masterReportId) {
  if (!state.session?.user?.id || confirmedByMe.has(masterReportId)) return;
  try {
    await confirmReport(masterReportId, state.session.user.id);
    confirmedByMe.add(masterReportId);
    setState({
      reports: state.reports.map((r) =>
        r.id === masterReportId ? { ...r, confirmation_count: (r.confirmation_count ?? 0) + 1 } : r,
      ),
    });
    refreshMapView();
    showToast(t("map.toast.confirmed"), "success");
  } catch (err) {
    if (err.alreadyConfirmed) {
      confirmedByMe.add(masterReportId);
      refreshMapView();
      showToast(err.message, "info");
      return;
    }
    showToast(err.message || t("map.toast.confirmFailed"), "error");
  }
}

async function ensureMap(container) {
  if (!leafletMod) {
    leafletMod = await import("https://esm.sh/leaflet@1.9.4");
  }
  const L = leafletMod.default ?? leafletMod;

  const position = await currentPositionOrDefault();
  map = L.map(container, { zoomControl: true }).setView([position.lat, position.lng], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  if (position.isReal) placeYouAreHereMarker(L, position);

  const recenterBtn = container.querySelector("#recenter-btn");
  if (recenterBtn) {
    recenterBtn.hidden = !navigator.geolocation;
    recenterBtn.addEventListener("click", async () => {
      const pos = await currentPositionOrDefault();
      if (!pos.isReal) return;
      placeYouAreHereMarker(L, pos);
      map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    });
  }

  // Leaflet measures its container at construction time. The container can
  // still be mid-layout then (view-transition opacity doesn't affect this,
  // but a fresh flex/grid layout pass can), so it sometimes caches a 0x0 or
  // stale size and never paints tiles until told to re-check.
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 250);
  window.addEventListener("resize", () => map?.invalidateSize());

  // Popup content is rendered fresh by Leaflet each time it opens, so a
  // single delegated listener on the map container catches every popup's
  // "still an issue?" button rather than re-binding per popup.
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-popup-confirm-id]");
    if (btn) handleConfirmClick(btn.dataset.popupConfirmId).then(() => map.closePopup());
  });

  window.__civicMap = map; // convenience for debugging in devtools only
}

/** Distinct blue "you are here" dot + pulse ring — kept off markerLayer so status/category filters never hide it. */
function placeYouAreHereMarker(L, position) {
  youAreHereMarker?.remove();
  const icon = L.divIcon({
    className: "",
    html: `<div class="you-are-here-pulse"></div><div class="you-are-here-dot"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  youAreHereMarker = L.marker([position.lat, position.lng], {
    icon,
    interactive: false,
    zIndexOffset: 1000,
    keyboard: false,
  }).addTo(map);
  youAreHereMarker.bindTooltip(t("map.youAreHere"), { direction: "top", offset: [0, -6] });
}

function currentPositionOrDefault() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...DEFAULT_CENTER, isReal: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, isReal: true }),
      () => resolve({ ...DEFAULT_CENTER, isReal: false }),
      { timeout: 4000 },
    );
  });
}

function renderMarkers(reports) {
  if (!markerLayer) return;
  const L = leafletMod.default ?? leafletMod;
  markerLayer.clearLayers();
  markerByReportId.clear();

  reports.forEach((r) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="map-pin map-pin--${r.status} map-pin--severity-${r.severity_label ? r.severity_label.toLowerCase() : "none"}"></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
    });
    const marker = L.marker([r.lat, r.lng], { icon }).addTo(markerLayer);
    marker.bindPopup(renderPopup(r));
    marker.on("add", () => {
      const el = marker.getElement()?.querySelector(".map-pin");
      if (el) animateMarkerDrop(el);
    });
    markerByReportId.set(r.id, marker);
  });
}

function renderPopup(r) {
  const confirmBtn =
    r.status !== "resolved"
      ? `<button class="btn btn--ghost btn--small" data-popup-confirm-id="${r.id}" ${confirmedByMe.has(r.id) ? "disabled" : ""}>
           ${confirmedByMe.has(r.id) ? t("map.card.confirmed") : t("map.card.stillIssue")}
         </button>`
      : "";
  return `
    <div class="map-popup">
      <img src="${r.photo_url}" alt="" />
      <div class="map-popup__body">
        <span class="category-chip">${escapeHtml(r.category?.name || "Uncategorized")}</span>
        <span class="badge badge--${r.status}">${t(`status.${r.status}`)}</span>
        ${renderSeverityAndCounts(r)}
        ${renderEtaChip(r)}
        <p>${escapeHtml(r.description)}</p>
        <div class="report-card__meta">
          <span>${escapeHtml(r.reporter_display_name)}</span>
          <span aria-hidden="true">·</span>
          <time data-relative-time datetime="${r.created_at}">${timeAgo(r.created_at)}</time>
        </div>
        ${confirmBtn}
      </div>
    </div>
  `;
}

function focusReportOnMap(reportId) {
  const marker = markerByReportId.get(reportId);
  if (!marker || !map) return;
  map.flyTo(marker.getLatLng(), 17, { duration: 0.6 });
  marker.openPopup();
}
