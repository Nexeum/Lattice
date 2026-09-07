// Collapsible "Deploy from GitHub" card for the workspace page. Manages
// repo watches: Lattice polls a public GitHub repo and, on new commits,
// builds its Dockerfile inside this workspace and (re)deploys the service.
// Self-contained: fetches its own data and degrades gracefully.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Github,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";
const WATCHES_POLL_MS = 20000;

/** Same naming rules as workspace containers: lowercase, dashes, alnum. */
const sanitizeServiceName = (raw) =>
  String(raw || "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

/** "https://github.com/user/repo(.git)" → "user/repo"; falls back to raw. */
const repoShort = (url) => {
  const match = String(url || "").match(
    /github\.com[/:]([^/\s]+)\/([^/\s?#]+)/i
  );
  if (match) return `${match[1]}/${match[2].replace(/\.git$/i, "")}`;
  return String(url || "");
};

const statusPillClass = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "ok") return "bg-green-50 text-green-600 border-green-100";
  if (s === "building")
    return "bg-amber-50 text-amber-600 border-amber-100 animate-pulse";
  if (s === "error") return "bg-red-50 text-red-600 border-red-100";
  return "bg-gray-100 text-gray-500 border-gray-200";
};

/** Pulls a human-friendly message out of an error Response without throwing. */
const readErrorDetail = async (response, fallback) => {
  try {
    const body = await response.json();
    if (body && typeof body.detail === "string") return body.detail;
    if (body && typeof body.error === "string") return body.error;
  } catch {
    /* non-JSON body — fall through to the fallback */
  }
  return fallback;
};

export const GithubDeployCard = ({ parentId, parentName }) => {
  const [expanded, setExpanded] = useState(false);
  const [watches, setWatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [service, setService] = useState("");
  const [adding, setAdding] = useState(false);

  const [checkingId, setCheckingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const requestRef = useRef(0);

  const fetchWatches = useCallback(async () => {
    if (!parentName) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/watches?parent=${encodeURIComponent(parentName)}`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`watches responded with ${response.status}`);
      }
      const body = await response.json();
      if (requestRef.current === token) {
        setWatches(Array.isArray(body) ? body : []);
        setUnavailable(false);
        setLoading(false);
      }
    } catch (err) {
      /* Endpoint missing or network down → clean empty state, never crash. */
      if (requestRef.current === token) {
        setWatches([]);
        setUnavailable(true);
        setLoading(false);
      }
    }
  }, [parentName]);

  // Fetch once for the collapsed badge; poll while expanded.
  useEffect(() => {
    fetchWatches();
    const timer = expanded ? setInterval(fetchWatches, WATCHES_POLL_MS) : null;
    return () => {
      if (timer) clearInterval(timer);
      requestRef.current += 1;
    };
  }, [expanded, fetchWatches]);

  const cleanedService = sanitizeServiceName(service);
  const canAdd =
    Boolean(repo.trim()) && Boolean(cleanedService) && Boolean(branch.trim());

  const handleAdd = async () => {
    if (!canAdd || adding) return;
    setAdding(true);
    try {
      const response = await fetch(`${CONTAINERS_API}/watches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          repo: repo.trim(),
          branch: branch.trim() || "main",
          service: cleanedService,
          parent: parentName,
        }),
      });
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 400) {
        toast.error(
          await readErrorDetail(
            response,
            "That doesn't look like a valid public GitHub repo URL."
          )
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`create responded with ${response.status}`);
      }
      const created = await response.json();
      if (created && created._id) {
        setWatches((prev) => [...prev, created]);
      } else {
        fetchWatches();
      }
      toast.success(`Watching ${repoShort(repo)}`);
      setRepo("");
      setService("");
      setBranch("main");
    } catch (err) {
      toast.error("Could not create the watch. Is the containers service running?");
    } finally {
      setAdding(false);
    }
  };

  const handleCheckNow = async (watch) => {
    if (checkingId) return;
    setCheckingId(watch._id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/watches/${encodeURIComponent(watch._id)}/check`,
        { method: "POST", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`check responded with ${response.status}`);
      }
      const updated = await response.json();
      if (updated && updated._id) {
        setWatches((prev) =>
          prev.map((item) => (item._id === updated._id ? updated : item))
        );
      } else {
        fetchWatches();
      }
      toast.info(`Checked ${repoShort(watch.repo)}`);
    } catch (err) {
      toast.error("Check failed — could not reach the containers service.");
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (watch) => {
    if (deletingId) return;
    const confirmed = window.confirm(
      `Stop watching ${repoShort(watch.repo)}? The deployed service is left as-is.`
    );
    if (!confirmed) return;
    setDeletingId(watch._id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/watches/${encodeURIComponent(watch._id)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`delete responded with ${response.status}`);
      }
      setWatches((prev) => prev.filter((item) => item._id !== watch._id));
      toast.success(`Stopped watching ${repoShort(watch.repo)}`);
    } catch (err) {
      toast.error("Could not delete the watch.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center space-x-2 min-w-0 text-left"
          title={expanded ? "Collapse GitHub deploys" : "Expand GitHub deploys"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <Github className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">
            Deploy from GitHub
          </span>
          {!expanded && watches.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {watches.length}
            </span>
          )}
        </button>
        <button
          onClick={fetchWatches}
          disabled={loading}
          title="Refresh watches"
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Watches a public GitHub repo; on new commits Lattice builds its
            Dockerfile inside this workspace and (re)deploys the service.
          </p>

          {/* Add-watch form */}
          <div className="space-y-2">
            <input
              type="text"
              value={repo}
              onChange={(event) => setRepo(event.target.value)}
              placeholder="https://github.com/user/repo"
              className="w-full px-3 py-2 rounded-xl border border-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
                title="Branch to watch"
                className="w-28 px-3 py-2 rounded-xl border border-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <input
                type="text"
                value={service}
                onChange={(event) => setService(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAdd();
                }}
                placeholder="service name"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <button
                onClick={handleAdd}
                disabled={!canAdd || adding}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Watch</span>
              </button>
            </div>
            {service && cleanedService !== service && (
              <p className="text-xs text-gray-400 font-mono">
                Final name: {cleanedService || "?"}
              </p>
            )}
          </div>

          {/* List / empty / unavailable states */}
          {unavailable ? (
            <p className="text-sm text-gray-400 py-2">
              GitHub deploys aren't available right now.
            </p>
          ) : watches.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No repos watched yet — add one above to auto-deploy on push.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {watches.map((watch) => {
                const isChecking = checkingId === watch._id;
                const isDeleting = deletingId === watch._id;
                const status = String(watch?.last_status || "").toLowerCase();
                return (
                  <div
                    key={watch._id}
                    className="rounded-2xl border border-gray-100 p-3"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <Github className="w-4 h-4 flex-shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {repoShort(watch.repo)}
                        </p>
                        <div className="flex items-center space-x-1.5 mt-0.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500 text-[10px] font-mono flex-shrink-0">
                            {watch.branch || "main"}
                          </span>
                          <span className="text-xs text-gray-400 truncate">
                            → {watch.service || "?"}
                          </span>
                          {watch.last_sha ? (
                            <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                              {String(watch.last_sha).slice(0, 7)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        title={
                          status === "error" && watch.last_error
                            ? String(watch.last_error)
                            : undefined
                        }
                        className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono flex-shrink-0 ${statusPillClass(
                          status
                        )}`}
                      >
                        {status || "pending"}
                      </span>
                      <button
                        onClick={() => handleCheckNow(watch)}
                        disabled={Boolean(checkingId) || isDeleting}
                        title="Check now"
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
                        />
                      </button>
                      <button
                        onClick={() => handleDelete(watch)}
                        disabled={isDeleting || isChecking}
                        title="Stop watching"
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {status === "error" && watch.last_error ? (
                      <p className="mt-2 text-xs text-red-500 font-mono break-words">
                        {String(watch.last_error)}
                      </p>
                    ) : null}

                    {watch.last_checked ? (
                      <p className="mt-1 text-[10px] text-gray-300 text-right">
                        checked {new Date(watch.last_checked).toLocaleTimeString()}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
