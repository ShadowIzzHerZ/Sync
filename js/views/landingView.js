const FEATURES = [
  {
    icon: "📷",
    title: "Snap a photo",
    body: "Point your camera at the pothole, overflowing bin, or dead streetlight. An on-device model suggests the category for you — nothing is uploaded just to guess.",
  },
  {
    icon: "📍",
    title: "Drop an exact pin",
    body: "We ask for your location and place the pin there automatically — drag it or click anywhere on the map if it needs adjusting.",
  },
  {
    icon: "🗺️",
    title: "See it on a shared map",
    body: "Every report is visible to everyone the moment it's filed, with its status and how long it's been open.",
  },
  {
    icon: "🔒",
    title: "Real accounts, real accountability",
    body: "Every pin is tied to a signed-in account — no anonymous noise, no duplicate spam, just reports a repair crew can trust.",
  },
];

const STEPS = [
  { n: "1", title: "Sign up", body: "Takes 20 seconds — just an email and a password." },
  { n: "2", title: "Report an issue", body: "Photo, category, and location — Zen fills in what it can." },
  { n: "3", title: "Track it", body: "Watch the status change from open to in progress to resolved." },
];

export function renderLandingView() {
  return `
    <div class="landing">
      <header class="landing__nav" data-animate>
        <div class="topbar__brand">
          <span class="topbar__mark" aria-hidden="true">◈</span>
          <span class="topbar__title">Zen</span>
        </div>
        <div class="landing__nav-actions">
          <a href="#/login" class="btn btn--ghost">Log in</a>
          <a href="#/signup" class="btn btn--primary">Sign up</a>
        </div>
      </header>

      <section class="landing__hero">
        <p class="landing__eyebrow" data-animate>CIVIC ISSUE REPORTING</p>
        <h1 class="landing__title" data-animate>See something broken in your neighborhood? Fix that.</h1>
        <p class="landing__subtitle" data-animate>
          Zen turns a phone photo into a tracked, public report — a pothole, an overflowing
          bin, a dead streetlight — pinned to a real map, tied to a real account, visible to
          everyone until it's actually resolved.
        </p>
        <div class="landing__cta-row" data-animate>
          <a href="#/signup" class="btn btn--primary btn--large">Get started free</a>
          <a href="#/login" class="btn btn--ghost btn--large">I already have an account</a>
        </div>
      </section>

      <section class="landing__section">
        <h2 class="landing__section-title" data-animate>What Zen actually does</h2>
        <div class="landing__features">
          ${FEATURES.map(
            (f) => `
            <div class="feature-card" data-animate-item>
              <div class="feature-card__icon" aria-hidden="true">${f.icon}</div>
              <h3>${f.title}</h3>
              <p>${f.body}</p>
            </div>
          `,
          ).join("")}
        </div>
      </section>

      <section class="landing__section landing__section--muted">
        <h2 class="landing__section-title" data-animate>Three steps, start to finish</h2>
        <div class="landing__steps">
          ${STEPS.map(
            (s) => `
            <div class="step-card" data-animate-item>
              <span class="step-card__number">${s.n}</span>
              <h3>${s.title}</h3>
              <p>${s.body}</p>
            </div>
          `,
          ).join("")}
        </div>
      </section>

      <section class="landing__final-cta" data-animate>
        <h2>Your city gets better one report at a time.</h2>
        <a href="#/signup" class="btn btn--primary btn--large">Create your account</a>
      </section>

      <footer class="landing__footer">
        <span>© ${new Date().getFullYear()} Zen</span>
        <a href="#/login">Log in</a>
        <a href="#/signup">Sign up</a>
      </footer>
    </div>
  `;
}
