import { state } from "../state.js";
import { createReport, uploadReportPhoto } from "../api.js";
import { classifyImage, estimateSeverity } from "../imageRecognition.js";
import { queuePendingReport } from "../offlineQueue.js";
import { showToast } from "../toast.js";
import { openModalAnimation, closeModalAnimation, animateProgress, shakeElement, withTimeout } from "../animations.js";
import { escapeHtml } from "./shell.js";

let leafletMod = null;
let pickerMap = null;
let pickerMarker = null;

/**
 * Opens the "report an issue" modal. Resolves with the created report row,
 * or null if the user cancelled.
 * @param {{lat:number, lng:number}} startLatLng
 */
export function openReportModal(startLatLng) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal-panel modal-panel--wide" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <div class="modal-header">
          <h2 id="report-modal-title">Report a civic issue</h2>
          <button class="icon-btn" id="report-modal-close" aria-label="Close">✕</button>
        </div>
        <form id="report-form" class="modal-body report-form">
          <div class="report-form__grid">
            <div class="report-form__col">
              <div class="field">
                <label for="photo-input">Photo</label>
                <div class="photo-drop" id="photo-drop">
                  <input id="photo-input" name="photo" type="file" accept="image/*" capture="environment" required />
                  <div class="photo-drop__placeholder" id="photo-placeholder">
                    <span class="photo-drop__icon" aria-hidden="true">📷</span>
                    <span>Click to add a photo, or take one now</span>
                  </div>
                  <img id="photo-preview" alt="Selected issue photo" hidden />
                </div>
                <div class="ai-status" id="ai-status" hidden>
                  <div class="progress-bar"><div class="progress-bar__fill" id="ai-progress"></div></div>
                  <span id="ai-status-text">Analyzing photo on-device…</span>
                </div>
                <div class="ai-suggestion" id="ai-suggestion" hidden></div>
                <div class="severity-badge" id="severity-badge" hidden></div>
              </div>

              <div class="field">
                <label for="category-select">Category</label>
                <select id="category-select" name="category_id" required>
                  <option value="" disabled selected>Choose a category</option>
                  ${state.categories
                    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
                    .join("")}
                </select>
              </div>

              <div class="field">
                <label for="description">What's going on?</label>
                <textarea id="description" name="description" rows="4" minlength="5" maxlength="2000" required placeholder="Describe the issue — size, severity, anything a repair crew should know."></textarea>
              </div>
            </div>

            <div class="report-form__col">
              <div class="field">
                <label>Location</label>
                <p class="field-hint">We'll ask for your location and drop the pin there — drag it or click anywhere on the map to place it exactly instead.</p>
                <div class="picker-map" id="picker-map"></div>
                <p class="location-status" id="location-status" aria-live="polite"></p>
                <button type="button" class="btn btn--ghost btn--small" id="use-my-location">Use my current location</button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn--ghost" id="report-cancel">Cancel</button>
            <button type="submit" class="btn btn--primary" id="report-submit">Submit report</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(backdrop);
    openModalAnimation(backdrop, backdrop.querySelector(".modal-panel"));

    let picked = { lat: startLatLng.lat, lng: startLatLng.lng };
    let selectedFile = null;
    let aiResult = null;
    let severityResult = null;
    let userMovedPin = false;

    const locationStatus = backdrop.querySelector("#location-status");

    // Ask for their location as soon as the report form opens, rather than
    // making "where is this?" a separate manual step — but don't block the
    // form on it, and never override a pin the user has already placed
    // themselves (including while this request is still in flight). Wait
    // for the picker map to actually be ready first: geolocation can
    // resolve before Leaflet finishes loading, and recentering a map that
    // doesn't exist yet would silently lose the result.
    initPickerMap(backdrop.querySelector("#picker-map"), picked, (latlng) => {
      picked = latlng;
      userMovedPin = true;
      locationStatus.textContent = "";
    }).then(requestInitialLocation);

    function requestInitialLocation() {
      if (!navigator.geolocation) return;
      locationStatus.textContent = "Finding your location…";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (userMovedPin) return;
          picked = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          recenterPickerMap(picked);
          locationStatus.textContent = "Located you — drag the pin if it's not quite right.";
        },
        () => {
          if (userMovedPin) return;
          locationStatus.textContent = "Couldn't get your location — place the pin manually.";
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    }

    const closeAndResolve = async (value) => {
      await closeModalAnimation(backdrop, backdrop.querySelector(".modal-panel"));
      teardownPickerMap();
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector("#report-modal-close").addEventListener("click", () => closeAndResolve(null));
    backdrop.querySelector("#report-cancel").addEventListener("click", () => closeAndResolve(null));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeAndResolve(null);
    });

    backdrop.querySelector("#use-my-location").addEventListener("click", () => {
      if (!navigator.geolocation) {
        showToast("Geolocation isn't available in this browser.", "error");
        return;
      }
      locationStatus.textContent = "Finding your location…";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          picked = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          userMovedPin = false; // this *is* the authoritative location now, not a manual override
          recenterPickerMap(picked);
          locationStatus.textContent = "Located you — drag the pin if it's not quite right.";
        },
        () => {
          locationStatus.textContent = "";
          showToast("Couldn't get your location — place the pin manually.", "error");
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });

    const photoInput = backdrop.querySelector("#photo-input");
    const photoPreview = backdrop.querySelector("#photo-preview");
    const photoPlaceholder = backdrop.querySelector("#photo-placeholder");
    const aiStatus = backdrop.querySelector("#ai-status");
    const aiProgress = backdrop.querySelector("#ai-progress");
    const aiStatusText = backdrop.querySelector("#ai-status-text");
    const aiSuggestion = backdrop.querySelector("#ai-suggestion");
    const severityBadge = backdrop.querySelector("#severity-badge");
    const categorySelect = backdrop.querySelector("#category-select");

    photoInput.addEventListener("change", async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      selectedFile = file;

      const url = URL.createObjectURL(file);
      photoPreview.src = url;
      photoPreview.hidden = false;
      photoPlaceholder.hidden = true;

      aiSuggestion.hidden = true;
      severityBadge.hidden = true;
      aiStatus.hidden = false;
      aiStatusText.textContent = "Loading on-device model…";
      animateProgress(aiProgress, 25);

      try {
        // decode() can hang on some platform/browser combinations without
        // ever rejecting; it's a smooth-paint nicety here, not a
        // requirement — .complete/naturalWidth (already true once the <img>
        // loads) is all canvas pixel reads and MobileNet actually need. Cap
        // the wait so a stall there can't block severity + classification.
        await withTimeout(photoPreview.decode().catch(() => {}), 1500);

        // Severity is a cheap canvas heuristic — no model to load — so run
        // it immediately rather than waiting on MobileNet.
        severityResult = estimateSeverity(photoPreview);
        severityBadge.hidden = false;
        severityBadge.innerHTML = renderSeverityBadge(severityResult);

        aiStatusText.textContent = "Analyzing photo on-device…";
        animateProgress(aiProgress, 65);
        const result = await classifyImage(photoPreview);
        aiResult = result.suggestion;
        animateProgress(aiProgress, 100);

        const match = state.categories.find((c) => c.slug === aiResult.slug);
        if (match) categorySelect.value = match.id;

        aiSuggestion.hidden = false;
        aiSuggestion.innerHTML = renderAiSuggestion(aiResult, match);
      } catch (err) {
        console.warn("Image recognition failed", err);
        aiStatusText.textContent = "Couldn't analyze this photo — pick a category manually.";
        animateProgress(aiProgress, 100);
      } finally {
        setTimeout(() => (aiStatus.hidden = true), 900);
      }
    });

    const form = backdrop.querySelector("#report-form");
    const submitBtn = backdrop.querySelector("#report-submit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedFile) {
        shakeElement(photoInput.closest(".photo-drop"));
        showToast("Add a photo of the issue first.", "error");
        return;
      }
      if (!categorySelect.value) {
        shakeElement(categorySelect);
        showToast("Pick a category.", "error");
        return;
      }
      const description = form.description.value.trim();
      if (description.length < 5) {
        shakeElement(form.description);
        showToast("Add a few more words describing the issue.", "error");
        return;
      }

      const reportData = {
        reporterId: state.session.user.id,
        reporterDisplayName: state.profile.display_name || state.profile.email,
        categoryId: categorySelect.value,
        description,
        lat: picked.lat,
        lng: picked.lng,
        aiLabel: aiResult?.label,
        aiConfidence: aiResult?.confidence,
        severity: severityResult?.level,
        severityLabel: severityResult?.label,
      };

      submitBtn.disabled = true;

      if (!navigator.onLine) {
        submitBtn.textContent = "Saving offline…";
        try {
          await queuePendingReport({ ...reportData, photoBlob: selectedFile });
          showToast(
            "You're offline — saved on this device and will submit automatically once you're back online.",
            "info",
          );
          await closeAndResolve({ offline: true });
        } catch (err) {
          showToast("Couldn't save this report: " + (err.message || "unknown error"), "error");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit report";
        }
        return;
      }

      submitBtn.textContent = "Uploading photo…";
      try {
        const photoUrl = await uploadReportPhoto(state.session.user.id, selectedFile);
        submitBtn.textContent = "Saving report…";
        const { ticket, merged } = await createReport({ ...reportData, photoUrl });
        showToast(
          merged
            ? "Someone nearby already reported this — added your confirmation instead of a duplicate pin."
            : "Report submitted — thanks for helping keep things fixed.",
          merged ? "info" : "success",
        );
        await closeAndResolve({ ticket, merged });
      } catch (err) {
        if (isLikelyNetworkError(err)) {
          try {
            await queuePendingReport({ ...reportData, photoBlob: selectedFile });
            showToast("Couldn't reach the network — saved on this device and will retry automatically.", "info");
            await closeAndResolve({ offline: true });
            return;
          } catch {
            // fall through to the generic error below
          }
        }
        showToast(err.message || "Couldn't submit the report.", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit report";
      }
    });
  });
}

function isLikelyNetworkError(err) {
  return err instanceof TypeError || /network|fetch|failed to fetch/i.test(err?.message || "");
}

function renderSeverityBadge(severity) {
  return `
    <span class="severity-badge__pill severity-badge__pill--${severity.label.toLowerCase()}">
      ${severity.label} severity
    </span>
    <span class="severity-badge__note">
      Estimated from the photo (shadow/void size, surface roughness) — not a measured dimension.
    </span>
  `;
}

function renderAiSuggestion(aiResult, matchedCategory) {
  const pct = Math.round((aiResult.confidence || 0) * 100);
  if (matchedCategory) {
    return `
      <span class="ai-suggestion__badge">On-device suggestion</span>
      Looks like <strong>${escapeHtml(matchedCategory.name)}</strong> (${pct}% match on "${escapeHtml(aiResult.label)}").
      Category preselected — change it if that's wrong.
    `;
  }
  return `
    <span class="ai-suggestion__badge ai-suggestion__badge--muted">On-device suggestion</span>
    Not confident enough to guess a category (closest match: "${escapeHtml(aiResult.label)}"). Please choose one yourself.
  `;
}

async function initPickerMap(container, center, onPick) {
  if (!leafletMod) {
    leafletMod = await import("https://esm.sh/leaflet@1.9.4");
  }
  const L = leafletMod.default ?? leafletMod;
  pickerMap = L.map(container, { zoomControl: true }).setView([center.lat, center.lng], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(pickerMap);

  pickerMarker = L.marker([center.lat, center.lng], { draggable: true }).addTo(pickerMap);
  pickerMarker.on("dragend", () => {
    const pos = pickerMarker.getLatLng();
    onPick({ lat: pos.lat, lng: pos.lng });
  });
  pickerMap.on("click", (e) => {
    pickerMarker.setLatLng(e.latlng);
    onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
  });

  setTimeout(() => pickerMap.invalidateSize(), 60);
}

function recenterPickerMap(latlng) {
  if (!pickerMap || !pickerMarker) return;
  pickerMap.setView([latlng.lat, latlng.lng], 16);
  pickerMarker.setLatLng([latlng.lat, latlng.lng]);
}

function teardownPickerMap() {
  pickerMap?.remove();
  pickerMap = null;
  pickerMarker = null;
}
