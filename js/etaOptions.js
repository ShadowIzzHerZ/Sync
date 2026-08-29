// ---------------------------------------------------------------------------
// The canonical "expected fix time" slugs — shared by the admin dashboard
// (which sets them) and the citizen map/my-reports cards (which display
// them). Kept as a single source of truth so the DB CHECK constraint, the
// <select> options, and the i18n keys ("eta.<value>") never drift apart.
// ---------------------------------------------------------------------------
export const ETA_OPTIONS = [
  { value: "not_scheduled", key: "eta.not_scheduled" },
  { value: "same_day", key: "eta.same_day" },
  { value: "1_2_days", key: "eta.1_2_days" },
  { value: "3_7_days", key: "eta.3_7_days" },
  { value: "1_2_weeks", key: "eta.1_2_weeks" },
  { value: "2_4_weeks", key: "eta.2_4_weeks" },
  { value: "1_3_months", key: "eta.1_3_months" },
];

export function etaKeyFor(value) {
  return ETA_OPTIONS.find((o) => o.value === value)?.key ?? null;
}
