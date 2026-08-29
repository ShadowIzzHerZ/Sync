import { signInWithEmail, signUpWithEmail } from "../auth.js";
import { showToast } from "../toast.js";
import { shakeElement } from "../animations.js";
import { navigate } from "../router.js";

export function renderAuthView(mode = "login") {
  const isSignup = mode === "signup";
  return `
    <div class="auth-screen">
      <div class="auth-card" data-animate>
        <a href="#/" class="auth-card__brand">
          <span class="topbar__mark" aria-hidden="true">◈</span>
          <span>Zen</span>
        </a>
        <p class="auth-card__tagline">Report a civic issue. Track it on the map. See it fixed.</p>

        <div class="auth-tabs" role="tablist">
          <a href="#/login" class="auth-tab ${!isSignup ? "auth-tab--active" : ""}" role="tab">Log in</a>
          <a href="#/signup" class="auth-tab ${isSignup ? "auth-tab--active" : ""}" role="tab">Sign up</a>
        </div>

        <form id="auth-form" class="auth-form" novalidate>
          ${
            isSignup
              ? `<div class="field">
                   <label for="display_name">Display name</label>
                   <input id="display_name" name="display_name" type="text" autocomplete="name" placeholder="e.g. Priya from Sector 12" />
                 </div>`
              : ""
          }
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="6" placeholder="At least 6 characters" />
          </div>
          <p class="field-hint">
            Accounts exist so every pin on the map is tied to a real person —
            it's what keeps the map honest.
          </p>
          <button type="submit" class="btn btn--primary btn--block" id="auth-submit">
            ${isSignup ? "Create account" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  `;
}

export function wireAuthView(root, mode) {
  const form = root.querySelector("#auth-form");
  const submitBtn = root.querySelector("#auth-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || password.length < 6) {
      shakeElement(form);
      showToast("Enter a valid email and a password of at least 6 characters.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signup" ? "Creating account…" : "Logging in…";

    try {
      if (mode === "signup") {
        const displayName = form.display_name?.value.trim();
        const { needsEmailConfirmation } = await signUpWithEmail(email, password, displayName);
        if (needsEmailConfirmation) {
          showToast("Account created — check your email to confirm, then log in.", "success");
          navigate("/login");
          return;
        }
        showToast("Welcome to Zen!", "success");
      } else {
        await signInWithEmail(email, password);
      }
      navigate("/map");
    } catch (err) {
      shakeElement(form);
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? "Create account" : "Log in";
    }
  });
}

function friendlyAuthError(err) {
  const msg = err?.message || "Something went wrong.";
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/already registered/i.test(msg)) return "That email already has an account — try logging in.";
  return msg;
}
