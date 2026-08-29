import { state } from "../state.js";
import { submitFeedback } from "../api.js";
import { showToast } from "../toast.js";
import { shakeElement } from "../animations.js";

export function renderFeedbackView() {
  return `
    <div class="page page--narrow" data-animate>
      <div class="page__header">
        <h1>Feedback</h1>
        <p class="page__subtitle">Found a bug, or something that could work better? Tell us.</p>
      </div>

      <form id="feedback-form" class="card feedback-form">
        <div class="field">
          <label>How's Zen working for you?</label>
          <div class="star-rating" id="star-rating" role="radiogroup" aria-label="Rating">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<button type="button" class="star" data-value="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`,
              )
              .join("")}
          </div>
        </div>
        <div class="field">
          <label for="feedback-message">Your feedback</label>
          <textarea id="feedback-message" name="message" rows="5" minlength="3" maxlength="2000" required placeholder="What worked, what didn't, what would help?"></textarea>
        </div>
        <button type="submit" class="btn btn--primary" id="feedback-submit">Send feedback</button>
      </form>
    </div>
  `;
}

export function wireFeedbackView(root) {
  const form = root.querySelector("#feedback-form");
  const stars = [...root.querySelectorAll(".star")];
  let rating = 0;

  const paintStars = () => {
    stars.forEach((s) => {
      const active = Number(s.dataset.value) <= rating;
      s.classList.toggle("star--active", active);
      s.setAttribute("aria-checked", String(active));
    });
  };

  stars.forEach((s) => {
    s.addEventListener("click", () => {
      rating = Number(s.dataset.value);
      paintStars();
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = form.message.value.trim();
    if (message.length < 3) {
      shakeElement(form.message);
      showToast("Add a bit more detail before sending.", "error");
      return;
    }

    const submitBtn = root.querySelector("#feedback-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      await submitFeedback({
        userId: state.session.user.id,
        message,
        rating: rating || null,
      });
      showToast("Thanks — feedback received.", "success");
      form.reset();
      rating = 0;
      paintStars();
    } catch (err) {
      showToast(err.message || "Couldn't send feedback.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send feedback";
    }
  });
}
