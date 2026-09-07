// Collapsible "Secrets" card for the workspace page. Secrets are stored on
// the parent workspace and injected into stack services as env vars. Values
// are never returned by the backend — only keys are listed. Self-contained:
// fetches its own data and degrades to a clean empty/error state when the
// backend is unavailable.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";

/** Mirror the server-side sanitisation so the hint reflects the stored key. */
const sanitizeKey = (raw) =>
  String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

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

export const SecretsPanel = ({ parentId }) => {
  const [expanded, setExpanded] = useState(false);
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);

  const requestRef = useRef(0);

  const fetchSecrets = useCallback(async () => {
    if (!parentId) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/secrets`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`secrets responded with ${response.status}`);
      }
      const body = await response.json();
      if (requestRef.current === token) {
        setSecrets(Array.isArray(body) ? body : []);
        setUnavailable(false);
        setLoading(false);
      }
    } catch (err) {
      if (requestRef.current === token) {
        setSecrets([]);
        setUnavailable(true);
        setLoading(false);
      }
    }
  }, [parentId]);

  useEffect(() => {
    fetchSecrets();
    return () => {
      requestRef.current += 1;
    };
  }, [fetchSecrets]);

  const cleanedKey = sanitizeKey(keyInput);

  const handleAdd = async () => {
    if (!parentId || !cleanedKey || !valueInput || adding) return;
    setAdding(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/secrets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ key: cleanedKey, value: valueInput }),
        }
      );
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 400) {
        toast.error(await readErrorDetail(response, "That secret key is not valid."));
        return;
      }
      if (!response.ok) {
        throw new Error(`add responded with ${response.status}`);
      }
      const body = await response.json().catch(() => null);
      const storedKey = (body && body.key) || cleanedKey;
      toast.success(`Secret "${storedKey}" saved`);
      setKeyInput("");
      setValueInput("");
      fetchSecrets();
    } catch (err) {
      toast.error("Could not save the secret. Is the containers service running?");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (key) => {
    if (deletingKey) return;
    setDeletingKey(key);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(
          parentId
        )}/secrets/${encodeURIComponent(key)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`delete responded with ${response.status}`);
      }
      toast.success(`Secret "${key}" deleted`);
      fetchSecrets();
    } catch (err) {
      toast.error("Could not delete the secret.");
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center space-x-2 min-w-0 text-left"
          title={expanded ? "Collapse secrets" : "Expand secrets"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <KeyRound className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Secrets</span>
          {!expanded && secrets.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {secrets.length}
            </span>
          )}
        </button>
        <button
          onClick={fetchSecrets}
          disabled={loading}
          title="Refresh secrets"
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Secrets are injected into stack services as env vars — reference one
            in a stack with{" "}
            <span className="font-mono text-gray-500">{"${KEY}"}</span>.
          </p>

          {/* Add form */}
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAdd();
              }}
              placeholder="KEY"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-100 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <input
              type="password"
              value={valueInput}
              onChange={(event) => setValueInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAdd();
              }}
              placeholder="value"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !cleanedKey || !valueInput || !parentId}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Add</span>
            </button>
          </div>
          {keyInput && cleanedKey !== keyInput && (
            <p className="text-xs text-gray-400 font-mono">
              Stored as: {cleanedKey || "?"}
            </p>
          )}

          {/* List / empty / unavailable states */}
          {unavailable ? (
            <p className="text-sm text-gray-400 py-2">
              Secrets aren't available right now.
            </p>
          ) : secrets.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No secrets yet — add one to inject it into your stacks.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {secrets.map((secret, index) => {
                const key = secret?.key || "";
                const isDeleting = deletingKey === key;
                return (
                  <div
                    key={`${key}-${index}`}
                    className="flex items-center space-x-2 rounded-2xl border border-gray-100 p-3"
                  >
                    <span className="text-sm font-mono text-gray-800 truncate flex-1 min-w-0">
                      {key || "?"}
                    </span>
                    <span
                      className="text-xs font-mono text-gray-300 flex-shrink-0"
                      title="Value is hidden and never leaves the server"
                    >
                      ••••••
                    </span>
                    <button
                      onClick={() => handleDelete(key)}
                      disabled={Boolean(deletingKey)}
                      title="Delete this secret"
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
