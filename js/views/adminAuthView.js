import { signInWithEmail, loadProfile, signOut } from "../auth.js";
import { setState } from "../state.js";
import { showToast } from "../toast.js";
import { shakeElement } from "../animations.js";
import { navigate } from "../router.js";
import { t, renderLanguageSwitcher, wireLanguageSwitchers } from "../i18n.js";

// Deliberately not styled like the citizen auth-card (see css/styles.css's
// .admin-auth-screen) — this is a separate portal for municipal staff, not
// another citizen sign-in surface, so it should read that way at a glance.
export function renderAdminAuthView() {
  return `
    <div class="admin-auth-screen">
      <div class="admin-auth-card" data-animate>
        <div class="admin-auth-card__top">
          <a href="#/" class="admin-auth-card__back">${t("admin.login.back")}</a>
          ${renderLanguageSwitcher()}
        </div>
        <div class="admin-auth-card__badge" aria-hidden="true">Z</div>
        <h1 class="admin-auth-card__title">${t("admin.login.title")}</h1>
        <p class="admin-auth-card__tagline">${t("admin.login.tagline")}</p>

        <form id="admin-auth-form" class="auth-form" novalidate>
          <div class="field">
            <label for="admin-email">${t("admin.login.email.label")}</label>
            <input id="admin-email" name="email" type="email" autocomplete="email" required placeholder="you@municipality.gov.in" />
          </div>
          <div class="field">
            <label for="admin-password">${t("admin.login.password.label")}</label>
            <input id="admin-password" name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="${t("auth.password.placeholder")}" />
          </div>
          <button type="submit" class="btn btn--primary btn--block admin-auth-card__submit" id="admin-auth-submit">
            ${t("admin.login.submit")}
          </button>
        </form>
      </div>
    </div>
  `;
}

export function wireAdminAuthView(root) {
  wireLanguageSwitchers(root);

  const form = root.querySelector("#admin-auth-form");
  const submitBtn = root.querySelector("#admin-auth-submit");

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
    submitBtn.textContent = t("admin.login.submitting");

    try {
      const session = await signInWithEmail(email, password);
      // Check the role *before* letting the router treat this as a signed-in
      // admin session — main.js's own auth-state listener will also load the
      // profile asynchronously, but gating access here (rather than trusting
      // that race) means a citizen account never even flashes the dashboard.
      const profile = await loadProfile(session.user.id);
      const role = profile?.role;

      if (role !== "staff" && role !== "admin") {
        await signOut();
        shakeElement(form);
        showToast(t("admin.login.staffOnly"), "error");
        return;
      }

      setState({ session, profile });
      navigate("/admin");
    } catch (err) {
      shakeElement(form);
      showToast(friendlyError(err), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t("admin.login.submit");
    }
  });
}

function friendlyError(err) {
  const msg = err?.message || t("auth.error.generic");
  if (/invalid login credentials/i.test(msg)) return t("auth.error.invalidCredentials");
  return msg;
}
