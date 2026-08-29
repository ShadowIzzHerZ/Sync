// ---------------------------------------------------------------------------
// Minimal app-wide store. No framework — just a plain object plus a
// subscriber list, since the whole app is a handful of views.
// ---------------------------------------------------------------------------
const listeners = new Set();

export const state = {
  session: null, // supabase auth session
  profile: null, // row from public.profiles
  categories: [], // rows from public.categories
  reports: [], // rows from public.reports (cached for the map + list)
  reportsLoadedAt: null,
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStaffOrAdmin() {
  return state.profile?.role === "staff" || state.profile?.role === "admin";
}
