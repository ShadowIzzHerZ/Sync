import { state } from "../state.js";
import { fetchMyReports, deleteReport } from "../api.js";
import { showToast } from "../toast.js";
import { timeAgo, absoluteTimestamp, startRelativeTimeTicker } from "../timeAgo.js";
import { animateListIn } from "../animations.js";
import { escapeHtml } from "./shell.js";
import { t, tSeverity } from "../i18n.js";
import { etaKeyFor } from "../etaOptions.js";
import { confirmDialog } from "../confirmDialog.js";

export function renderMyReportsView() {
  return `
    <div class="page page--narrow" data-animate>
      <div class="page__header">
        <h1>${t("reports.title")}</h1>
        <p class="page__subtitle">${t("reports.subtitle")}</p>
      </div>
      <div class="report-grid" id="my-report-grid"></div>
    </div>
  `;
}

export async function wireMyReportsView(root) {
  startRelativeTimeTicker();
  const grid = root.querySelector("#my-report-grid");

  let mine = [];
  try {
    mine = await fetchMyReports(state.session.user.id);
  } catch (err) {
    showToast(err.message || t("reports.toast.loadFailed"), "error");
  }

  if (!mine.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>${t("reports.empty")}</p>
        <a href="#/map" class="btn btn--primary">${t("reports.emptyCta")}</a>
      </div>
    `;
    return;
  }

  grid.innerHTML = mine
    .map((r) => {
      const merged = r.cluster_id !== r.id;
      const severity = r.severity_label
        ? `<span class="severity-pill severity-pill--${r.severity_label.toLowerCase()}" title="Estimated from the photo, not measured">${tSeverity(r.severity_label)}</span>`
        : "";
      const etaKey = etaKeyFor(r.eta_status);
      return `
      <article class="report-card report-card--grid" data-animate-item>
        <img class="report-card__photo" src="${r.photo_url}" alt="" loading="lazy" />
        <div class="report-card__body">
          <div class="report-card__top">
            <span class="category-chip">${escapeHtml(r.category?.name || "Uncategorized")}</span>
            <span class="badge badge--${r.status}">${t(`status.${r.status}`)}</span>
          </div>
          ${severity ? `<div class="report-card__signals">${severity}</div>` : ""}
          ${etaKey ? `<p class="eta-chip">${t("eta.cardLabel", { eta: t(etaKey) })}</p>` : ""}
          ${merged ? `<p class="merged-note">${t("reports.merged")}</p>` : ""}
          <p class="report-card__description">${escapeHtml(r.description)}</p>
          <div class="report-card__meta">
            <time data-relative-time datetime="${r.created_at}" title="${absoluteTimestamp(r.created_at)}">${timeAgo(r.created_at)}</time>
          </div>
          <div class="report-card__actions">
            <button class="btn btn--ghost btn--small btn--danger" data-delete-id="${r.id}">${t("reports.delete")}</button>
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  animateListIn(grid);

  grid.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmed = await confirmDialog({
        title: t("reports.confirm.title"),
        message: t("reports.confirm.message"),
        confirmLabel: t("reports.confirm.confirmLabel"),
        danger: true,
      });
      if (!confirmed) return;
      try {
        await deleteReport(btn.dataset.deleteId);
        showToast(t("reports.toast.deleted"), "success");
        wireMyReportsView(root);
      } catch (err) {
        showToast(err.message || t("reports.toast.deleteFailed"), "error");
      }
    });
  });
}
