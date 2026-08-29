import { t, renderLanguageSwitcher } from "../i18n.js";

function features() {
  return [
    { title: t("landing.features.photo.title"), body: t("landing.features.photo.body") },
    { title: t("landing.features.pin.title"), body: t("landing.features.pin.body") },
    { title: t("landing.features.map.title"), body: t("landing.features.map.body") },
    { title: t("landing.features.accounts.title"), body: t("landing.features.accounts.body") },
  ];
}

function steps() {
  return [
    { n: "1", title: t("landing.steps.1.title"), body: t("landing.steps.1.body") },
    { n: "2", title: t("landing.steps.2.title"), body: t("landing.steps.2.body") },
    { n: "3", title: t("landing.steps.3.title"), body: t("landing.steps.3.body") },
  ];
}

export function renderLandingView() {
  return `
    <div class="landing">
      <header class="landing__nav" data-animate>
        <div class="topbar__brand">
          <span class="topbar__mark" aria-hidden="true">Z</span>
          <span class="topbar__title">Zen</span>
        </div>
        <div class="landing__nav-actions">
          ${renderLanguageSwitcher()}
          <a href="#/login" class="btn btn--ghost">${t("landing.nav.login")}</a>
          <a href="#/signup" class="btn btn--primary">${t("landing.nav.signup")}</a>
        </div>
      </header>

      <section class="landing__hero">
        <h1 class="landing__title" data-animate>${t("landing.hero.title")}</h1>
        <p class="landing__subtitle" data-animate>${t("landing.hero.subtitle")}</p>
        <div class="landing__cta-row" data-animate>
          <a href="#/signup" class="btn btn--primary btn--large">${t("landing.hero.cta")}</a>
          <a href="#/login" class="landing__cta-secondary">${t("landing.hero.ctaSecondary")}</a>
        </div>
      </section>

      <section class="landing__section">
        <h2 class="landing__section-title" data-animate>${t("landing.features.title")}</h2>
        <div class="landing__features">
          ${features()
            .map(
              (f) => `
            <div class="feature-card" data-animate-item>
              <h3>${f.title}</h3>
              <p>${f.body}</p>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>

      <section class="landing__section landing__section--muted">
        <h2 class="landing__section-title" data-animate>${t("landing.steps.title")}</h2>
        <div class="landing__steps">
          ${steps()
            .map(
              (s) => `
            <div class="step-card" data-animate-item>
              <span class="step-card__number">${s.n}</span>
              <h3>${s.title}</h3>
              <p>${s.body}</p>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>

      <section class="landing__final-cta" data-animate>
        <h2>${t("landing.finalCta.title")}</h2>
        <a href="#/signup" class="btn btn--primary btn--large">${t("landing.finalCta.button")}</a>
      </section>

      <footer class="landing__footer">
        <span>© ${new Date().getFullYear()} Zen</span>
        <a href="#/login">${t("landing.nav.login")}</a>
        <a href="#/signup">${t("landing.nav.signup")}</a>
        <a href="#/admin/login" class="landing__footer-staff">${t("landing.staffLogin")}</a>
      </footer>
    </div>
  `;
}
