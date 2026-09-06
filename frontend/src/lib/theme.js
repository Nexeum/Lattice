// Tiny theme manager for the pragmatic dark-mode overlay.
// The dark look itself lives in index.css under the `.dark` scope; this
// module only owns the class on <html> and the persisted preference.

const STORAGE_KEY = "lattice-theme";
const DARK = "dark";
const LIGHT = "light";

// Stored preference, defaulting to light when missing or unreadable.
export const getTheme = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === DARK ? DARK : LIGHT;
  } catch {
    return LIGHT;
  }
};

// Applies a theme to the document and persists it. Returns the applied theme.
export const applyTheme = (theme) => {
  const next = theme === DARK ? DARK : LIGHT;
  document.documentElement.classList.toggle(DARK, next === DARK);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage unavailable (private mode etc.) — the class still applies.
  }
  return next;
};

// Flips the current theme. Returns the new theme.
export const toggleTheme = () => applyTheme(getTheme() === DARK ? LIGHT : DARK);

// Applies whatever was stored. Call once on app load.
export const initTheme = () => applyTheme(getTheme());
