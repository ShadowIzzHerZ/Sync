// ---------------------------------------------------------------------------
// "Time since the issue was made" — a small, dependency-free relative time
// formatter, plus a helper that keeps every <time data-relative> element on
// the page fresh without a manual refresh.
// ---------------------------------------------------------------------------
const UNITS = [
  { limit: 60, divisor: 1, unit: "just now", instant: true },
  { limit: 3600, divisor: 60, unit: "minute" },
  { limit: 86400, divisor: 3600, unit: "hour" },
  { limit: 604800, divisor: 86400, unit: "day" },
  { limit: 2629800, divisor: 604800, unit: "week" },
  { limit: 31557600, divisor: 2629800, unit: "month" },
  { limit: Infinity, divisor: 31557600, unit: "year" },
];

export function timeAgo(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);

  for (const { limit, divisor, unit, instant } of UNITS) {
    if (seconds < limit) {
      if (instant) return "just now";
      const value = Math.floor(seconds / divisor);
      return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
    }
  }
  return "a while ago";
}

export function absoluteTimestamp(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Re-render every `[data-relative-time]` node's text from its `datetime` attr. */
export function refreshRelativeTimes(root = document) {
  root.querySelectorAll("[data-relative-time]").forEach((el) => {
    const iso = el.getAttribute("datetime");
    if (iso) el.textContent = timeAgo(iso);
  });
}

let tickerStarted = false;
export function startRelativeTimeTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => refreshRelativeTimes(), 30_000);
}
