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
