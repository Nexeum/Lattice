// Shared auth helpers for talking to the Lattice services.

export const getToken = () => localStorage.getItem("token") || "";

export const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// For protected pages: on a 401, drop the stale token and send the user to
// the login screen. Returns true when it redirected. Do NOT use on public
// pages (Home, docs) — those should just hide the affected widget.
export const redirectIfUnauthorized = (response) => {
  if (response && response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/auth";
    return true;
  }
  return false;
};

// Decode the JWT payload (base64url-safe). Returns the payload object, or
// null when the token is missing/malformed.
export const getTokenPayload = () => {
  try {
    const token = getToken();
    if (!token) return null;
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
};

// Role claim baked into the JWT; defaults to "user" for legacy tokens.
export const getRole = () => {
  const payload = getTokenPayload();
  return payload?.role || "user";
};

// Decode the JWT payload and return its expiry as epoch millis, or null if
// the token is missing/malformed.
export const tokenExpiresAt = () => {
  const payload = getTokenPayload();
  return payload && typeof payload.exp === "number" ? payload.exp * 1000 : null;
};

const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const REFRESH_THRESHOLD_MS = 3 * 60 * 60 * 1000; // renew within 3 hours of expiry

let refreshStarted = false;

// Silently renews the session token before it expires. Idempotent: repeated
// calls while a loop is already running return a no-op stop function.
export const startTokenRefresh = () => {
  if (refreshStarted) return () => {};
  refreshStarted = true;

  const check = async () => {
    const expiresAt = tokenExpiresAt();
    if (expiresAt === null || expiresAt - Date.now() > REFRESH_THRESHOLD_MS) {
      return;
    }
    try {
      const response = await fetch("http://localhost:5005/refresh", {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) return; // 401 etc: the next protected fetch redirects
      const data = await response.json();
      if (data && data.token) {
        localStorage.setItem("token", data.token);
      }
    } catch (error) {
      console.error("Token refresh failed", error);
    }
  };

  check();
  const intervalId = setInterval(check, REFRESH_CHECK_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
    refreshStarted = false;
  };
};
