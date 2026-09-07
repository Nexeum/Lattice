// Collapsible "Scheduled Jobs" card for the workspace page. Lets the user run
// a container on a standard 5-field cron schedule, toggle jobs on/off, run one
// immediately, and delete them. Polls the list every 20s while expanded.
// Self-contained: fetches its own data and degrades to a clean empty/error
// state when the backend is unavailable.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";
const POLL_INTERVAL_MS = 20000;

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
  if (!value) return "never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "never" : date.toLocaleString();
};

/** Visual treatment for the last_status pill. */
const STATUS_STYLES = {
  running: "bg-amber-100 text-amber-700 animate-pulse",
  ok: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-600",
  idle: "bg-gray-100 text-gray-500",
};

const statusLabel = (status) => {
  const key = String(status || "idle").toLowerCase();
  return STATUS_STYLES[key] ? key : "idle";
};

export const CronPanel = ({ parentId }) => {
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [image, setImage] = useState("");
  const [command, setCommand] = useState("");
  const [creating, setCreating] = useState(false);

  const [runningId, setRunningId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const requestRef = useRef(0);

  const fetchJobs = useCallback(async () => {
    if (!parentId) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/cronjobs`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`cronjobs responded with ${response.status}`);
      }
      const body = await response.json();
      if (requestRef.current === token) {
        setJobs(Array.isArray(body) ? body : []);
        setUnavailable(false);
        setLoading(false);
      }
    } catch (err) {
      if (requestRef.current === token) {
        setJobs([]);
        setUnavailable(true);
        setLoading(false);
      }
    }
  }, [parentId]);

  useEffect(() => {
    fetchJobs();
    return () => {
      requestRef.current += 1;
    };
  }, [fetchJobs]);

  // Poll while the panel is open so status pills stay fresh.
  useEffect(() => {
    if (!expanded || !parentId) return undefined;
    const intervalId = window.setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [expanded, parentId, fetchJobs]);

  const canCreate =
    Boolean(parentId) &&
    name.trim() &&
    schedule.trim() &&
    image.trim() &&
    command.trim();

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/cronjobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            name: name.trim(),
            schedule: schedule.trim(),
            image: image.trim(),
            command: command.trim(),
          }),
        }
      );
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 400) {
        toast.error(
          await readErrorDetail(response, "That cron schedule is not valid.")
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`create responded with ${response.status}`);
      }
      toast.success(`Scheduled job "${name.trim()}" created`);
      setName("");
      setSchedule("");
      setImage("");
      setCommand("");
      fetchJobs();
    } catch (err) {
      toast.error("Could not create the job. Is the containers service running?");
    } finally {
      setCreating(false);
    }
  };

  const handleRunNow = async (job) => {
    if (runningId) return;
    setRunningId(job.id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(
          parentId
        )}/cronjobs/${encodeURIComponent(job.id)}/run`,
        { method: "POST", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`run responded with ${response.status}`);
      }
      const body = await response.json().catch(() => null);
      if (body && body.id) {
        setJobs((prev) => prev.map((j) => (j.id === body.id ? body : j)));
      } else {
        fetchJobs();
      }
      toast.success(`Ran "${job.name}"`);
    } catch (err) {
      toast.error("Could not run the job.");
      fetchJobs();
    } finally {
      setRunningId(null);
    }
  };

  const handleToggle = async (job) => {
    if (togglingId) return;
    setTogglingId(job.id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/cronjobs/${encodeURIComponent(job.id)}/toggle`,
        { method: "POST", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`toggle responded with ${response.status}`);
      }
      const body = await response.json().catch(() => null);
      if (body && body.id) {
        setJobs((prev) => prev.map((j) => (j.id === body.id ? body : j)));
      } else {
        fetchJobs();
      }
    } catch (err) {
      toast.error("Could not toggle the job.");
      fetchJobs();
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (job) => {
    if (deletingId) return;
    const confirmed = window.confirm(`Delete scheduled job "${job.name}"?`);
    if (!confirmed) return;
    setDeletingId(job.id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(
          parentId
        )}/cronjobs/${encodeURIComponent(job.id)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`delete responded with ${response.status}`);
      }
      toast.success(`Deleted "${job.name}"`);
      fetchJobs();
    } catch (err) {
      toast.error("Could not delete the job.");
    } finally {
      setDeletingId(null);
    }
  };

  const inputClass =
    "flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center space-x-2 min-w-0 text-left"
          title={expanded ? "Collapse scheduled jobs" : "Expand scheduled jobs"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <CalendarClock className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">
            Scheduled Jobs
          </span>
          {!expanded && jobs.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {jobs.length}
            </span>
          )}
        </button>
        <button
          onClick={fetchJobs}
          disabled={loading}
          title="Refresh scheduled jobs"
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Run a container on a schedule (standard 5-field cron).
          </p>

          {/* Create form */}
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="job name"
              className="w-full px-3 py-2 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <div>
              <input
                type="text"
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="*/5 * * * *"
                className="w-full px-3 py-2 rounded-xl border border-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <p className="mt-1 text-[11px] text-gray-400 font-mono">
                min hour dom mon dow
              </p>
            </div>
            <input
              type="text"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="alpine:3.19"
              className="w-full px-3 py-2 rounded-xl border border-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleCreate();
                }}
                placeholder="echo hello"
                className={inputClass + " font-mono"}
              />
              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* List / empty / unavailable states */}
          {unavailable ? (
            <p className="text-sm text-gray-400 py-2">
              Scheduled jobs aren't available right now.
            </p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No scheduled jobs yet — add one above.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {jobs.map((job) => {
                const status = statusLabel(job?.last_status);
                const isRunning = runningId === job.id;
                const isToggling = togglingId === job.id;
                const isDeleting = deletingId === job.id;
                const enabled = Boolean(job?.enabled);
                return (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-gray-100 p-3"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {job?.name || "unnamed"}
                          </p>
                          <span className="px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500 text-[11px] font-mono flex-shrink-0">
                            {job?.schedule || "—"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 font-mono truncate">
                          {job?.image || "—"}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${STATUS_STYLES[status]}`}
                        title={
                          status === "error" && job?.last_output
                            ? String(job.last_output)
                            : `last run: ${formatDate(job?.last_run)}`
                        }
                      >
                        {status}
                      </span>
                      <button
                        onClick={() => handleToggle(job)}
                        disabled={isToggling}
                        title={enabled ? "Disable job" : "Enable job"}
                        className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0 ${
                          enabled
                            ? "text-green-600 hover:bg-green-50"
                            : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        {isToggling ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRunNow(job)}
                        disabled={Boolean(runningId)}
                        title="Run now"
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                      >
                        {isRunning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(job)}
                        disabled={isDeleting}
                        title="Delete job"
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {status === "error" && job?.last_output && (
                      <pre className="mt-2 bg-red-50 border border-red-100 text-red-600 rounded-xl p-2 text-[11px] font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                        {String(job.last_output)}
                      </pre>
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
