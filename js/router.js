import { state } from "./state.js";
import { renderShell, wireShell } from "./views/shell.js";
import { renderLandingView } from "./views/landingView.js";
import { renderAuthView, wireAuthView } from "./views/authView.js";
import { renderMapView, wireMapView } from "./views/mapView.js";
import { renderMyReportsView, wireMyReportsView } from "./views/myReportsView.js";
import { renderFeedbackView, wireFeedbackView } from "./views/feedbackView.js";
import { animateViewIn, animateListIn } from "./animations.js";

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

export function rerender() {
  render();
}
