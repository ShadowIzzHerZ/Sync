import { state, isStaffOrAdmin } from "./state.js";
import { renderShell, wireShell } from "./views/shell.js";
import { renderLandingView } from "./views/landingView.js";
import { renderAuthView, wireAuthView } from "./views/authView.js";
import { renderMapView, wireMapView } from "./views/mapView.js";
import { renderMyReportsView, wireMyReportsView } from "./views/myReportsView.js";
import { renderFeedbackView, wireFeedbackView } from "./views/feedbackView.js";
import { renderAdminAuthView, wireAdminAuthView } from "./views/adminAuthView.js";
import { renderAdminShell, wireAdminShell, renderAdminDashboard, wireAdminDashboard } from "./views/adminView.js";
import { animateViewIn, animateListIn } from "./animations.js";
import { wireLanguageSwitchers } from "./i18n.js";

const root = document.getElementById("app");

export function navigate(path) {
  window.location.hash = `#${path}`;
}

function currentPath() {
  return window.location.hash.replace(/^#/, "");
}

export function initRouter() {
  window.addEventListener("hashchange", render);
  render();
}

async function render() {
  const path = currentPath();

  // The municipal admin portal is a separate area gated on role, not just
  // sign-in — handled first so it never falls through into the citizen
  // landing/auth logic below.
  if (path.startsWith("/admin")) {
    await renderAdminArea(path);
    return;
  }

  const loggedIn = Boolean(state.session && state.profile);

  if (!loggedIn) {
    if (path === "/login" || path === "/signup") {
      const mode = path === "/signup" ? "signup" : "login";
      root.innerHTML = renderAuthView(mode);
      wireAuthView(root, mode);
      animateViewIn(root);
      return;
    }
    // Anything else while signed out — including a bare "/", an empty
    // hash, or a stale deep link to a page that now needs auth — lands on
    // the landing page rather than dropping straight into a login form.
    root.innerHTML = renderLandingView();
    wireLanguageSwitchers(root);
    animateViewIn(root);
    root.querySelectorAll(".landing__features, .landing__steps").forEach(animateListIn);
    return;
  }

  if (path === "" || path === "/" || path === "/login" || path === "/signup") {
    navigate("/map");
    return;
  }

  const routeName = path.startsWith("/reports") ? "reports" : path.startsWith("/feedback") ? "feedback" : "map";

  let content = "";
  if (routeName === "map") content = renderMapView();
  else if (routeName === "reports") content = renderMyReportsView();
  else if (routeName === "feedback") content = renderFeedbackView();

  root.innerHTML = renderShell(routeName, content);
  wireShell(root);

  const routeContent = document.getElementById("route-content");
  if (routeName === "map") await wireMapView(routeContent);
  else if (routeName === "reports") await wireMyReportsView(routeContent);
  else if (routeName === "feedback") wireFeedbackView(routeContent);

  animateViewIn(routeContent);
}

async function renderAdminArea(path) {
  const isAdminUser = Boolean(state.session && state.profile) && isStaffOrAdmin();

  if (!isAdminUser) {
    if (path !== "/admin/login") {
      navigate("/admin/login");
      return;
    }
    root.innerHTML = renderAdminAuthView();
    wireAdminAuthView(root);
    animateViewIn(root);
    return;
  }

  if (path === "/admin/login") {
    navigate("/admin");
    return;
  }

  root.innerHTML = renderAdminShell(renderAdminDashboard());
  wireAdminShell(root);

  const routeContent = document.getElementById("admin-route-content");
  await wireAdminDashboard(routeContent);
  animateViewIn(routeContent);
}

export function rerender() {
  render();
}
