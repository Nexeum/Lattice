// Collapsible "Volumes" card for the workspace page. Lists named Docker
// volumes attached to this workspace. Volumes are created automatically when
// a stack is deployed, so there is no create form here — only listing and
// deletion. Self-contained: fetches its own data and degrades to a clean
// empty/error state when the backend is unavailable.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  HardDrive,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";

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

export const VolumesPanel = ({ parentId }) => {
  const [expanded, setExpanded] = useState(false);
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [deletingName, setDeletingName] = useState(null);
  const [copiedName, setCopiedName] = useState(null);

  const requestRef = useRef(0);

  const fetchVolumes = useCallback(async () => {
    if (!parentId) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/volumes`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`volumes responded with ${response.status}`);
      }
      const body = await response.json();
      if (requestRef.current === token) {
        setVolumes(Array.isArray(body) ? body : []);
        setUnavailable(false);
        setLoading(false);
      }
    } catch (err) {
      if (requestRef.current === token) {
        setVolumes([]);
        setUnavailable(true);
        setLoading(false);
      }
    }
  }, [parentId]);

  useEffect(() => {
    fetchVolumes();
    return () => {
      requestRef.current += 1;
    };
  }, [fetchVolumes]);

  const handleCopy = async (mountableAs) => {
    const text = String(mountableAs || "");
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard unavailable");
      }
      setCopiedName(text);
      toast.success("Copied mount hint");
      window.setTimeout(() => {
        setCopiedName((prev) => (prev === text ? null : prev));
      }, 1500);
    } catch (err) {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleDelete = async (name) => {
    if (deletingName) return;
    const confirmed = window.confirm(
      `Delete volume "${name}"? Any data it holds is lost permanently.`
    );
    if (!confirmed) return;
    setDeletingName(name);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(
          parentId
        )}/volumes/${encodeURIComponent(name)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 409) {
        toast.error(
          await readErrorDetail(
            response,
            `Volume "${name}" is in use and can't be deleted.`
          )
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`delete responded with ${response.status}`);
      }
      toast.success(`Volume "${name}" deleted`);
      fetchVolumes();
    } catch (err) {
      toast.error("Could not delete the volume.");
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center space-x-2 min-w-0 text-left"
          title={expanded ? "Collapse volumes" : "Expand volumes"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <HardDrive className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Volumes</span>
          {!expanded && volumes.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {volumes.length}
            </span>
          )}
        </button>
        <button
          onClick={fetchVolumes}
          disabled={loading}
          title="Refresh volumes"
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Named volumes persist data across container restarts. Reference one
            in a stack service with{" "}
            <span className="font-mono text-gray-500">
              {'"volumes": ["name:/path"]'}
            </span>
            .
          </p>
          <p className="text-xs text-gray-400">
            Volumes are created automatically when a stack is deployed — there's
            nothing to add here by hand.
          </p>

          {/* List / empty / unavailable states */}
          {unavailable ? (
            <p className="text-sm text-gray-400 py-2">
              Volumes aren't available right now.
            </p>
          ) : volumes.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No volumes yet — deploy a stack that declares one to see it here.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {volumes.map((volume, index) => {
                const name = volume?.name || "";
                const mountableAs = volume?.mountable_as || "";
                const isDeleting = deletingName === name;
                const isCopied = copiedName === mountableAs && mountableAs;
                return (
                  <div
                    key={`${name}-${index}`}
                    className="flex items-center space-x-2 rounded-2xl border border-gray-100 p-3"
                  >
                    <span className="text-sm font-mono text-gray-800 truncate flex-1 min-w-0">
                      {name || "?"}
                    </span>
                    {mountableAs && (
                      <button
                        onClick={() => handleCopy(mountableAs)}
                        title={`Copy mount hint: ${mountableAs}`}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 flex-shrink-0"
                      >
                        {isCopied ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(name)}
                      disabled={Boolean(deletingName)}
                      title="Delete this volume"
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
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
