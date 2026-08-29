const FEATURES = [
  {
    title: "Snap a photo",
    body: "Point your camera at the pothole, the overflowing bin, the dead streetlight. A model running on your own device suggests a category — nothing gets uploaded just to take a guess.",
  },
  {
    title: "Drop an exact pin",
    body: "We ask for your location and place the pin there automatically. Drag it, or click anywhere on the map, if it needs adjusting.",
  },
  {
    title: "See it on a shared map",
    body: "Every report shows up the moment it's filed — status, age, and all — for anyone to see, not just you.",
  },
  {
    title: "Accounts, not anonymous noise",
    body: "Every pin is tied to a signed-in person. No duplicate spam, no throwaway reports — just something a repair crew can actually act on.",
  },
];

const STEPS = [
  { n: "1", title: "Sign up", body: "An email and a password. Twenty seconds, maybe less." },
  { n: "2", title: "Report an issue", body: "Photo, category, location — Zen fills in what it can." },
  { n: "3", title: "Track it", body: "Watch it move from open, to in progress, to resolved." },
];

export function renderLandingView() {
  return `
    <div class="landing">
      <header class="landing__nav" data-animate>
        <div class="topbar__brand">
          <span class="topbar__mark" aria-hidden="true">Z</span>
          <span class="topbar__title">Zen</span>
        </div>
        <div class="landing__nav-actions">
          <a href="#/login" class="btn btn--ghost">Log in</a>
          <a href="#/signup" class="btn btn--primary">Sign up</a>
        </div>
      </header>

      <section class="landing__hero">
        <h1 class="landing__title" data-animate>Something's broken on your street. Report it in a minute.</h1>
        <p class="landing__subtitle" data-animate>
          Zen turns a phone photo into a public report — pinned to a real map, tied to your
          account, visible to everyone until it's actually fixed. No office to call, no form
          that disappears into an inbox.
        </p>
        <div class="landing__cta-row" data-animate>
          <a href="#/signup" class="btn btn--primary btn--large">Sign up</a>
          <a href="#/login" class="landing__cta-secondary">Already have an account? Log in</a>
        </div>
      </section>

      <section class="landing__section">
        <h2 class="landing__section-title" data-animate>What Zen actually does</h2>
        <div class="landing__features">
          ${FEATURES.map(
            (f) => `
            <div class="feature-card" data-animate-item>
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
        <h2>Seen something that needs fixing?</h2>
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
