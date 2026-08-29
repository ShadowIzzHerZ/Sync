import { signInWithEmail, signUpWithEmail } from "../auth.js";
import { showToast } from "../toast.js";
import { shakeElement } from "../animations.js";
import { navigate } from "../router.js";
import { t, renderLanguageSwitcher, wireLanguageSwitchers } from "../i18n.js";

export function renderAuthView(mode = "login") {
  const isSignup = mode === "signup";
  return `
    <div class="auth-screen">
      <div class="auth-card" data-animate>
        <div class="auth-card__top">
          <a href="#/" class="auth-card__brand">
            <span class="topbar__mark" aria-hidden="true">Z</span>
            <span>Zen</span>
          </a>
          ${renderLanguageSwitcher()}
        </div>
        <p class="auth-card__tagline">${t("auth.tagline")}</p>

        <div class="auth-tabs" role="tablist">
          <a href="#/login" class="auth-tab ${!isSignup ? "auth-tab--active" : ""}" role="tab">${t("auth.tab.login")}</a>
          <a href="#/signup" class="auth-tab ${isSignup ? "auth-tab--active" : ""}" role="tab">${t("auth.tab.signup")}</a>
        </div>

        <form id="auth-form" class="auth-form" novalidate>
          ${
            isSignup
              ? `<div class="field">
                   <label for="display_name">${t("auth.displayName.label")}</label>
                   <input id="display_name" name="display_name" type="text" autocomplete="name" placeholder="${t("auth.displayName.placeholder")}" />
                 </div>`
              : ""
          }
          <div class="field">
            <label for="email">${t("auth.email.label")}</label>
            <input id="email" name="email" type="email" autocomplete="email" required placeholder="${t("auth.email.placeholder")}" />
          </div>
          <div class="field">
            <label for="password">${t("auth.password.label")}</label>
            <input id="password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="6" placeholder="${t("auth.password.placeholder")}" />
          </div>
          <p class="field-hint">${t("auth.hint")}</p>
          <button type="submit" class="btn btn--primary btn--block" id="auth-submit">
            ${isSignup ? t("auth.submit.signup") : t("auth.submit.login")}
          </button>
        </form>
      </div>
    </div>
  `;
}

export function wireAuthView(root, mode) {
  wireLanguageSwitchers(root);

  const form = root.querySelector("#auth-form");
  const submitBtn = root.querySelector("#auth-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || password.length < 6) {
      shakeElement(form);
      showToast(t("auth.error.generic"), "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signup" ? t("auth.submitting.signup") : t("auth.submitting.login");

    try {
      if (mode === "signup") {
        const displayName = form.display_name?.value.trim();
        const { needsEmailConfirmation } = await signUpWithEmail(email, password, displayName);
        if (needsEmailConfirmation) {
          showToast(t("auth.toast.accountCreated"), "success");
          navigate("/login");
          return;
        }
        showToast(t("auth.toast.welcome"), "success");
      } else {
        await signInWithEmail(email, password);
      }
      navigate("/map");
    } catch (err) {
      shakeElement(form);
      showToast(friendlyAuthError(err), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? t("auth.submit.signup") : t("auth.submit.login");
    }
  });
}

function friendlyAuthError(err) {
  const msg = err?.message || t("auth.error.generic");
  if (/invalid login credentials/i.test(msg)) return t("auth.error.invalidCredentials");
  if (/already registered/i.test(msg)) return t("auth.error.alreadyRegistered");
  return msg;
}
