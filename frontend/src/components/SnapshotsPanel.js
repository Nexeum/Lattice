// Collapsible "Snapshots" card for the workspace page. Lets the user save
// the state of the containers inside a workspace, restore a previous
// snapshot, or delete old ones. Self-contained: fetches its own data and
// degrades to a clean empty/error state when the backend is unavailable.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";

/** Same naming rules as workspace containers: lowercase, dashes, alnum. */
const sanitizeSnapshotName = (raw) =>
  String(raw || "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

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

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

export const SnapshotsPanel = ({ parentId, parentName, onRestored }) => {
  const [expanded, setExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [restoringId, setRestoringId] = useState(null);
  const [restoreReport, setRestoreReport] = useState(null); // { snapshotId, results }
  const [deletingId, setDeletingId] = useState(null);

  const requestRef = useRef(0);

  const fetchSnapshots = useCallback(async () => {
    if (!parentName) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/snapshots?parent=${encodeURIComponent(parentName)}`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`snapshots responded with ${response.status}`);
      }
      const body = await response.json();
      if (requestRef.current === token) {
        setSnapshots(Array.isArray(body) ? body : []);
        setUnavailable(false);
        setLoading(false);
      }
    } catch (err) {
      /* Endpoint missing or network down → clean empty state, never crash. */
      if (requestRef.current === token) {
        setSnapshots([]);
        setUnavailable(true);
        setLoading(false);
      }
    }
  }, [parentName]);

  useEffect(() => {
    fetchSnapshots();
    return () => {
      requestRef.current += 1;
    };
  }, [fetchSnapshots]);

  const cleanedName = sanitizeSnapshotName(name);

  const handleSave = async () => {
    if (!parentId || !cleanedName || saving) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/snapshots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ name: cleanedName }),
        }
      );
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 400) {
        toast.error(
          await readErrorDetail(
            response,
            "This workspace has no containers to snapshot yet."
          )
        );
        return;
      }
      if (response.status === 409) {
        toast.error(
          await readErrorDetail(
            response,
            `A snapshot named "${cleanedName}" already exists.`
          )
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`save responded with ${response.status}`);
      }
      toast.success(`Snapshot "${cleanedName}" saved`);
      setName("");
      fetchSnapshots();
    } catch (err) {
      toast.error("Could not save the snapshot. Is the containers service running?");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (snapshot) => {
    if (restoringId) return;
    const confirmed = window.confirm(
      "Restore will replace the current containers. Continue?"
    );
    if (!confirmed) return;
    setRestoringId(snapshot.id);
    setRestoreReport(null);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/snapshots/${encodeURIComponent(snapshot.id)}/restore`,
        { method: "POST", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`restore responded with ${response.status}`);
      }
      const body = await response.json();
      const results = Array.isArray(body) ? body : [];
      setRestoreReport({ snapshotId: snapshot.id, results });
      const failed = results.filter((r) => !r?.ok);
      if (failed.length === 0) {
        toast.success(`Snapshot "${snapshot.name}" restored`);
      } else {
        toast.error(
          `Restore finished with ${failed.length} of ${results.length} containers failing`
        );
      }
      if (typeof onRestored === "function") onRestored();
    } catch (err) {
      toast.error("Restore failed. Is the containers service running?");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (snapshot) => {
    if (deletingId) return;
    const confirmed = window.confirm(
      `Delete snapshot "${snapshot.name}"? This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingId(snapshot.id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/snapshots/${encodeURIComponent(snapshot.id)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`delete responded with ${response.status}`);
      }
      toast.success(`Snapshot "${snapshot.name}" deleted`);
      setRestoreReport((prev) =>
        prev && prev.snapshotId === snapshot.id ? null : prev
      );
      fetchSnapshots();
    } catch (err) {
      toast.error("Could not delete the snapshot.");
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
          title={expanded ? "Collapse snapshots" : "Expand snapshots"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <Camera className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Snapshots</span>
          {!expanded && snapshots.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {snapshots.length}
            </span>
          )}
        </button>
        <button
          onClick={fetchSnapshots}
          disabled={loading}
          title="Refresh snapshots"
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Snapshots capture the containers inside this workspace so you can
            roll back or repeat experiments.
          </p>

          {/* Save-state form */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSave();
              }}
              placeholder="snapshot name"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button
              onClick={handleSave}
              disabled={saving || !cleanedName || !parentId}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              <span>Save state</span>
            </button>
          </div>
          {name && cleanedName !== name && (
            <p className="text-xs text-gray-400 font-mono">
              Final name: {cleanedName || "?"}
            </p>
          )}

          {/* List / empty / unavailable states */}
          {unavailable ? (
            <p className="text-sm text-gray-400 py-2">
              Snapshots aren't available right now.
            </p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No snapshots yet — save one to freeze the current containers.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {snapshots.map((snapshot) => {
                const children = Array.isArray(snapshot?.children)
                  ? snapshot.children
                  : [];
                const isRestoring = restoringId === snapshot.id;
                const isDeleting = deletingId === snapshot.id;
                return (
                  <div
                    key={snapshot.id}
                    className="rounded-2xl border border-gray-100 p-3"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {snapshot.name || "unnamed"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(snapshot.created_at)}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono flex-shrink-0">
                        {children.length}{" "}
                        {children.length === 1 ? "container" : "containers"}
                      </span>
                      <button
                        onClick={() => handleRestore(snapshot)}
                        disabled={Boolean(restoringId) || isDeleting}
                        title="Restore this snapshot"
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                      >
                        {isRestoring ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(snapshot)}
                        disabled={isDeleting || isRestoring}
                        title="Delete this snapshot"
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {children.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {children.map((child, index) => (
                          <span
                            key={`${child?.name || "child"}-${index}`}
                            className="px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500 text-[10px] font-mono"
                          >
                            {child?.name || "?"}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Per-child restore results */}
                    {restoreReport && restoreReport.snapshotId === snapshot.id && (
                      <div className="mt-2 pl-3 border-l-2 border-gray-100 space-y-1">
                        {restoreReport.results.length === 0 ? (
                          <p className="text-xs text-gray-400">
                            Restore returned no results.
                          </p>
                        ) : (
                          restoreReport.results.map((result, index) => (
                            <div
                              key={`${result?.name || "result"}-${index}`}
                              className="text-xs"
                            >
                              <span
                                className={`font-mono ${
                                  result?.ok ? "text-green-600" : "text-red-500"
                                }`}
                              >
                                {result?.ok ? "✓" : "✗"} {result?.name || "?"}
                              </span>
                              {!result?.ok && result?.output ? (
                                <pre className="mt-1 bg-red-50 border border-red-100 text-red-600 rounded-xl p-2 text-[11px] font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                                  {String(result.output)}
                                </pre>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    )}
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
