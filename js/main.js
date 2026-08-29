import { supabase } from "./config.js";
import { state, setState } from "./state.js";
import { loadProfile, onAuthStateChange } from "./auth.js";
import { fetchCategories } from "./api.js";
import { initRouter, rerender } from "./router.js";
import { startAutoFlush } from "./offlineQueue.js";
import { showToast } from "./toast.js";
import { getLanguage, onLanguageChange, t } from "./i18n.js";

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.warn("Service worker registration failed (offline support won't be available)", err);
    });
  };
  // main.js runs as a module script, which can execute well after the
  // window's `load` event has already fired (e.g. after the several
  // `await`s in main() below) — registering a "load" listener at that
  // point would silently never fire. Register immediately if we've
  // already missed it.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}

async function bootstrapSession(session) {
  if (!session) {
    setState({ session: null, profile: null });
    return;
  }
  const [profile, categories] = await Promise.all([
    loadProfile(session.user.id),
    fetchCategories().catch(() => []),
  ]);
  setState({ session, profile, categories });
}

async function main() {
  document.documentElement.lang = getLanguage();
  // A language switch anywhere in the app just needs the current route
  // re-rendered with the new dictionary — no route/state change involved.
  onLanguageChange(() => rerender());

  const {
    data: { session },
  } = await supabase.auth.getSession();

  await bootstrapSession(session);
  initRouter();

  onAuthStateChange(async (newSession) => {
    // supabase-js fires this on far more than sign-in/out — it also fires
    // right after subscribing and on every silent access-token refresh
    // (roughly hourly). Rebuilding the whole route on those is wasteful and
    // actively dangerous: it tears down and recreates the Leaflet map/DOM
    // out from under anything mid-flight (e.g. the report modal sitting
    // open while its own async work — photo upload, on-device
    // classification — is still running), orphaning that view's closures.
    // Only actually re-render when the signed-in user changes.
    const previousUserId = state.session?.user?.id ?? null;
    const nextUserId = newSession?.user?.id ?? null;
    // Still refresh `state.session` itself even when the user is unchanged,
    // so later API calls use the newly-refreshed access token.
    if (nextUserId === previousUserId && nextUserId !== null) {
      setState({ session: newSession });
      return;
    }
    await bootstrapSession(newSession);
    rerender();
  });

  registerServiceWorker();

  // Reports drafted while offline live in IndexedDB until this fires them
  // off — on load (if already online) and again every time the browser
  // regains a connection.
  startAutoFlush(({ ok, ticket, merged, error }) => {
    if (ok) {
      showToast(merged ? t("report.toast.merged") : t("main.toast.queuedSynced"), "success");
      rerender();
    } else if (navigator.onLine) {
      // Only worth mentioning if we're actually online and it still failed
      // — if we're offline, this is just the queue correctly waiting.
      showToast(`${t("main.toast.queuedSyncFailed")} ${error?.message || "unknown error"}`, "error");
    }
  });
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  document.getElementById("app").innerHTML = `
    <div class="fatal-error">
      <h1>Zen couldn't start</h1>
      <p>${err.message || "Unknown error"}</p>
    </div>
  `;
});
