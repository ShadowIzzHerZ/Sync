import { state } from "../state.js";
import { fetchMyReports, deleteReport } from "../api.js";
import { showToast } from "../toast.js";
import { timeAgo, absoluteTimestamp, startRelativeTimeTicker } from "../timeAgo.js";
import { animateListIn } from "../animations.js";
import { escapeHtml } from "./shell.js";
import { STATUS_LABELS } from "../config.js";
import { confirmDialog } from "../confirmDialog.js";

export function renderMyReportsView() {
  return `
    <div class="page page--narrow" data-animate>
      <div class="page__header">
        <h1>My reports</h1>
        <p class="page__subtitle">Everything you've reported, and where it stands.</p>
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
    showToast(err.message || "Couldn't load your reports.", "error");
  }

  if (!mine.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>You haven't reported anything yet.</p>
        <a href="#/map" class="btn btn--primary">Report your first issue</a>
      </div>
    `;
    return;
  }

  grid.innerHTML = mine
    .map((r) => {
      const merged = r.cluster_id !== r.id;
      const severity = r.severity_label
        ? `<span class="severity-pill severity-pill--${r.severity_label.toLowerCase()}" title="Estimated from the photo, not measured">${r.severity_label}</span>`
        : "";
      return `
      <article class="report-card report-card--grid" data-animate-item>
        <img class="report-card__photo" src="${r.photo_url}" alt="" loading="lazy" />
        <div class="report-card__body">
          <div class="report-card__top">
            <span class="category-chip">${escapeHtml(r.category?.name || "Uncategorized")}</span>
            <span class="badge badge--${r.status}">${STATUS_LABELS[r.status]}</span>
          </div>
          ${severity ? `<div class="report-card__signals">${severity}</div>` : ""}
          ${merged ? `<p class="merged-note">Merged into an existing nearby report of the same issue — your submission confirmed it.</p>` : ""}
          <p class="report-card__description">${escapeHtml(r.description)}</p>
          <div class="report-card__meta">
            <time data-relative-time datetime="${r.created_at}" title="${absoluteTimestamp(r.created_at)}">${timeAgo(r.created_at)}</time>
          </div>
          <div class="report-card__actions">
            <button class="btn btn--ghost btn--small btn--danger" data-delete-id="${r.id}">Delete</button>
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
        title: "Delete this report?",
        message: "This can't be undone.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) return;
      try {
        await deleteReport(btn.dataset.deleteId);
        showToast("Report deleted.", "success");
        wireMyReportsView(root);
      } catch (err) {
        showToast(err.message || "Couldn't delete report.", "error");
      }
    });
  });
}
