// ---------------------------------------------------------------------------
// All motion in the app goes through Anime.js (v3). Kept centralized so
// every view uses the same timeline conventions, stagger targets, and
// easing — instead of ad-hoc CSS transitions scattered around.
//
// Conventions used throughout this file:
//   - Anime.js default easing ('easeOutElastic(1, .5)' etc.) is left alone
//     unless a specific easing reads better for the motion; we stick to the
//     documented easeOut* family rather than inventing custom bezier curves.
//   - Entrances use anime.stagger() on translateY + opacity.
//   - Multi-step sequences use anime.timeline() rather than chained
//     setTimeouts, so they stay scrubbable/cancelable as a unit.
// ---------------------------------------------------------------------------
import animeLib from "https://esm.sh/animejs@3.2.2";

// HIG accessibility guidance: motion should be optional, and apps that
// respond to the system's Reduce Motion setting should cut automatic,
// repetitive animation rather than requiring people to sit through it.
// Every animation in this file goes through anime()/anime.timeline() below
// instead of the library directly, so this one check governs the whole
// app — call sites don't need to know or care about it.
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function anime(params) {
  if (prefersReducedMotion()) {
    params = { ...params, duration: 1, delay: 0, loop: false };
  }
  return animeLib(params);
}
anime.set = animeLib.set;
anime.stagger = animeLib.stagger;
anime.timeline = (params = {}) => {
  const reduce = prefersReducedMotion();
  const tl = animeLib.timeline(params);
  if (reduce) {
    const originalAdd = tl.add.bind(tl);
    tl.add = (p, offset) => originalAdd({ ...p, duration: 1, delay: 0 }, offset);
  }
  return tl;
};

/**
 * Races a promise against a timeout. Anime.js's animations resolve via
 * requestAnimationFrame — if that engine ever stalls (a backgrounded/
 * throttled tab, a device sleeping mid-transition, or just a browser bug),
 * a completion promise that never resolves would silently deadlock any
 * cleanup gated on it: a modal that can never be dismissed, a toast that's
 * never removed. Anywhere a caller needs to *know* an animation is done
 * before doing something functionally important, this puts a ceiling on
 * that wait so it degrades to "cleanup happens a bit early" instead of
 * "cleanup never happens."
 */
export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

/** Fade + rise a view's direct children in, staggered. Used on every route change. */
export function animateViewIn(container) {
  const targets = container.querySelectorAll("[data-animate]");
  if (!targets.length) return;

  anime.set(targets, { opacity: 0, translateY: 14 });
  return anime({
    targets,
    opacity: [0, 1],
    translateY: [14, 0],
    duration: 520,
    easing: "easeOutExpo",
    delay: anime.stagger(60, { start: 80 }),
  });
}

/** Card-list entrance (report list, category chips) — slightly snappier stagger. */
export function animateListIn(listEl) {
  const items = listEl.querySelectorAll("[data-animate-item]");
  if (!items.length) return;

  anime.set(items, { opacity: 0, translateY: 10, scale: 0.98 });
  return anime({
    targets: items,
    opacity: [0, 1],
    translateY: [10, 0],
    scale: [0.98, 1],
    duration: 420,
    easing: "easeOutQuad",
    delay: anime.stagger(45),
  });
}

/** Modal open: backdrop fade + panel rise, sequenced as one timeline. */
export function openModalAnimation(backdropEl, panelEl) {
  anime.set(backdropEl, { opacity: 0 });
  anime.set(panelEl, { opacity: 0, translateY: 24, scale: 0.96 });

  const tl = anime.timeline({ easing: "easeOutExpo" });
  tl.add({
    targets: backdropEl,
    opacity: [0, 1],
    duration: 200,
  }).add(
    {
      targets: panelEl,
      opacity: [0, 1],
      translateY: [24, 0],
      scale: [0.96, 1],
      duration: 420,
    },
    "-=120",
  );
  return tl;
}

/** Modal close: reverse timeline, resolves once fully hidden so callers can unmount. */
export function closeModalAnimation(backdropEl, panelEl) {
  const tl = anime.timeline({ easing: "easeInQuad" });
  tl.add({
    targets: panelEl,
    opacity: [1, 0],
    translateY: [0, 16],
    scale: [1, 0.97],
    duration: 220,
  }).add(
    {
      targets: backdropEl,
      opacity: [1, 0],
      duration: 180,
    },
    "-=140",
  );
  return withTimeout(tl.finished, 900);
}

/** Toast enter/auto-exit as a single timeline with a hold in the middle. */
export function toastLifecycle(toastEl, holdMs = 3200) {
  anime.set(toastEl, { opacity: 0, translateY: -12, scale: 0.98 });
  const tl = anime.timeline();
  tl.add({
    targets: toastEl,
    opacity: [0, 1],
    translateY: [-12, 0],
    scale: [0.98, 1],
    duration: 380,
    easing: "easeOutBack",
  })
    .add({
      targets: toastEl,
      duration: holdMs,
    })
    .add({
      targets: toastEl,
      opacity: [1, 0],
      translateY: [0, -10],
      duration: 260,
      easing: "easeInQuad",
    });
  return withTimeout(tl.finished, holdMs + 900);
}

/** Drop-in bounce for a freshly placed / newly loaded map marker element. */
export function animateMarkerDrop(markerEl) {
  anime.set(markerEl, { translateY: -24, opacity: 0 });
  return anime({
    targets: markerEl,
    translateY: [-24, 0],
    opacity: [0, 1],
    duration: 620,
    easing: "easeOutElastic(1, .55)",
  });
}

/** Confirm dialog: icon pops in with a back-ease, then title/message/footer stagger up under it. */
export function animateConfirmContents(iconEl, partEls) {
  const tl = anime.timeline({ easing: "easeOutExpo" });

  if (iconEl) {
    anime.set(iconEl, { scale: 0, opacity: 0, rotate: -20 });
    tl.add({
      targets: iconEl,
      scale: [0, 1],
      opacity: [0, 1],
      rotate: [-20, 0],
      duration: 480,
      easing: "easeOutBack",
    });
  }

  anime.set(partEls, { opacity: 0, translateY: 12 });
  tl.add(
    {
      targets: partEls,
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 380,
      delay: anime.stagger(70),
    },
    iconEl ? "-=220" : 0,
  );

  return tl;
}

/** Gentle continuous pulse for a dialog's icon while it waits on the user. Caller pauses it before removing the node. */
export function pulseIcon(iconEl) {
  return anime({
    targets: iconEl,
    scale: [1, 1.12, 1],
    duration: 1400,
    easing: "easeInOutSine",
    loop: true,
  });
}

/** Button press feedback + optional shake for validation errors. */
export function shakeElement(el) {
  return anime({
    targets: el,
    translateX: [0, -8, 8, -6, 6, -3, 3, 0],
    duration: 480,
    easing: "easeInOutSine",
  });
}

/** Animated count-up, used for small stats (e.g. "N reports near you"). */
export function countUp(el, to, { duration = 900 } = {}) {
  const obj = { value: 0 };
  return anime({
    targets: obj,
    value: to,
    duration,
    easing: "easeOutExpo",
    round: 1,
    update: () => {
      el.textContent = String(obj.value);
    },
  });
}

/** Progress bar fill for the on-device image recognition step. */
export function animateProgress(barEl, toPercent) {
  return anime({
    targets: barEl,
    width: `${toPercent}%`,
    duration: 500,
    easing: "easeOutQuad",
  });
}
