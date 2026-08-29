// ---------------------------------------------------------------------------
// Minimal i18n layer. No framework, no esm.sh dependency (unlike Leaflet /
// Anime.js) — the dictionaries are plain static imports so translated text
// keeps working offline, the same way the rest of the app shell does.
//
// Usage: `import { t } from "../i18n.js"` then `t("nav.map")` anywhere a
// view builds its template string. Missing keys fall back to English, then
// to the key itself (so a missing translation is visible/debuggable instead
// of silently blank).
// ---------------------------------------------------------------------------
import en from "./i18n/en.js";
import hi from "./i18n/hi.js";
import bn from "./i18n/bn.js";
import ta from "./i18n/ta.js";
import te from "./i18n/te.js";
import mr from "./i18n/mr.js";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "mr", label: "मराठी" },
];

const DICTS = { en, hi, bn, ta, te, mr };
const STORAGE_KEY = "zen-language";

function detectDefault() {
  const nav = typeof navigator !== "undefined" ? navigator.language || navigator.userLanguage : "";
  const short = (nav || "").slice(0, 2).toLowerCase();
  return DICTS[short] ? short : "en";
}

let current;
try {
  current = localStorage.getItem(STORAGE_KEY) || detectDefault();
} catch {
  // localStorage can throw in private-browsing/blocked-storage contexts.
  current = detectDefault();
}
if (!DICTS[current]) current = "en";

const listeners = new Set();

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  if (!DICTS[code] || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Ignore — the switch still works for this session, just won't persist.
  }
  if (typeof document !== "undefined") document.documentElement.lang = code;
  listeners.forEach((fn) => fn(code));
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {string} key - dotted lookup key, e.g. "landing.hero.title"
 * @param {Record<string,string|number>} [vars] - "{name}" placeholders to interpolate
 */
export function t(key, vars) {
  const dict = DICTS[current] || DICTS.en;
  let str = dict[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

/** Translates a severity_label value ("Low"/"Medium"/"High" from the DB/heuristic) for display. */
export function tSeverity(label) {
  return label ? t(`severity.${label.toLowerCase()}`) : "";
}

/** A <select> of every supported language, current one pre-selected. */
export function renderLanguageSwitcher(extraClass = "") {
  return `
    <select class="lang-switch ${extraClass}" id="lang-switch" aria-label="${t("a11y.languageSwitcher")}">
      ${LANGUAGES.map((l) => `<option value="${l.code}" ${l.code === current ? "selected" : ""}>${l.label}</option>`).join("")}
    </select>
  `;
}

/** Wires every `.lang-switch` under `root` (there may be more than one, e.g. landing nav) to setLanguage + a rerender. */
export function wireLanguageSwitchers(root, onChange) {
  root.querySelectorAll(".lang-switch").forEach((sel) => {
    sel.addEventListener("change", () => {
      setLanguage(sel.value);
      onChange?.();
    });
  });
}
