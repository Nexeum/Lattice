// Collapsible "Files" card for the workspace page. Lets the user browse the
// filesystem of a child container (raw `ls -la`), upload a file to a path, and
// download a file by path. Self-contained and defensive: raw ls output is
// shown verbatim, and every action degrades to a clean message when the child
// has no shell or the backend is unavailable.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderOpen,
  Loader2,
  Upload,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized, getToken } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";
const DEFAULT_PATH = "/root";

const childId = (child) => child?.ID || child?.id || "";
const childName = (child) => child?.Name || child?.name || "";

/** Join a directory and filename into a single absolute-ish path. */
const joinPath = (dir, file) => {
  const base = String(dir || "").replace(/\/+$/, "");
  const leaf = String(file || "").replace(/^\/+/, "");
  return `${base}/${leaf}`;
};

export const FilesPanel = ({ parentId, children }) => {
  const childList = Array.isArray(children) ? children : [];

  const [expanded, setExpanded] = useState(false);
  const [selectedChild, setSelectedChild] = useState("");
  const [path, setPath] = useState(DEFAULT_PATH);
  const [listing, setListing] = useState(null); // { path, entries } | { path, error }
  const [loading, setLoading] = useState(false);
  const [downloadName, setDownloadName] = useState("");
  const [uploading, setUploading] = useState(false);

  const requestRef = useRef(0);
  const fileInputRef = useRef(null);

  // Default the dropdown to the first available child once children arrive.
  useEffect(() => {
    if (!selectedChild && childList.length > 0) {
      setSelectedChild(childId(childList[0]));
    }
    // If the previously selected child disappeared, reset.
    if (
      selectedChild &&
      !childList.some((c) => childId(c) === selectedChild)
    ) {
      setSelectedChild(childList.length > 0 ? childId(childList[0]) : "");
    }
  }, [childList, selectedChild]);

  const runLs = useCallback(
    async (dir) => {
      if (!parentId || !selectedChild) return;
      const token = requestRef.current + 1;
      requestRef.current = token;
      setLoading(true);
      try {
        const response = await fetch(
          `${CONTAINERS_API}/container/${encodeURIComponent(
            parentId
          )}/${encodeURIComponent(selectedChild)}/ls?path=${encodeURIComponent(
            dir
          )}`,
          { headers: { ...authHeaders() } }
        );
        if (redirectIfUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error(`ls responded with ${response.status}`);
        }
        const body = await response.json();
        if (requestRef.current === token) {
          setListing(
            body && typeof body === "object"
              ? body
              : { path: dir, entries: [] }
          );
          setLoading(false);
        }
      } catch (err) {
        if (requestRef.current === token) {
          setListing({
            path: dir,
            error: "Could not list this path. The container may have no shell.",
          });
          setLoading(false);
        }
      }
    },
    [parentId, selectedChild]
  );

  // Reset the view when the selected child changes.
  useEffect(() => {
    setListing(null);
    return () => {
      requestRef.current += 1;
    };
  }, [selectedChild]);

  const handleGo = () => {
    const dir = path.trim() || DEFAULT_PATH;
    runLs(dir);
  };

  const handleUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    // Always clear the input so re-selecting the same file fires change again.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !parentId || !selectedChild || uploading) return;
    const dir = path.trim() || DEFAULT_PATH;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("path", dir);
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(
          parentId
        )}/${encodeURIComponent(selectedChild)}/upload`,
        { method: "POST", headers: { ...authHeaders() }, body: form }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`upload responded with ${response.status}`);
      }
      const body = await response.json().catch(() => null);
      const name = (body && body.name) || file.name;
      toast.success(`Uploaded "${name}"`);
      runLs(dir);
    } catch (err) {
      toast.error("Upload failed. The container may have no shell.");
    } finally {
      setUploading(false);
    }
  };

  const buildDownloadHref = () => {
    const leaf = downloadName.trim();
    if (!leaf || !parentId || !selectedChild) return null;
    const dir = path.trim() || DEFAULT_PATH;
    const abs = leaf.startsWith("/") ? leaf : joinPath(dir, leaf);
    const query = new URLSearchParams({ path: abs, token: getToken() });
    return `${CONTAINERS_API}/container/${encodeURIComponent(
      parentId
    )}/${encodeURIComponent(selectedChild)}/download?${query.toString()}`;
  };

  const downloadHref = buildDownloadHref();
  const inputClass =
    "px-3 py-2 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center space-x-2 min-w-0 text-left"
          title={expanded ? "Collapse files" : "Expand files"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <FolderOpen className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Files</span>
          {!expanded && childList.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {childList.length}
            </span>
          )}
        </button>
        <button
          onClick={handleGo}
          disabled={loading || !selectedChild}
          title="Refresh listing"
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <FolderOpen className={`w-4 h-4 ${loading ? "animate-pulse" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Browse, upload, and download files inside a container in this
            workspace.
          </p>

          {childList.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No containers in this workspace yet — add one to browse its files.
            </p>
          ) : (
            <>
              {/* Container selector + path + Go */}
              <div className="flex items-center space-x-2">
                <select
                  value={selectedChild}
                  onChange={(event) => setSelectedChild(event.target.value)}
                  className={inputClass + " flex-shrink-0 bg-white"}
                >
                  {childList.map((child, index) => (
                    <option
                      key={`${childId(child)}-${index}`}
                      value={childId(child)}
                    >
                      {childName(child) || childId(child) || "container"}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleGo();
                  }}
                  placeholder={DEFAULT_PATH}
                  className={inputClass + " flex-1 min-w-0 font-mono"}
                />
                <button
                  onClick={handleGo}
                  disabled={loading || !selectedChild}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Go</span>
                  )}
                </button>
              </div>

              {/* Raw ls output */}
              {listing === null ? (
                <p className="text-sm text-gray-400 py-2">
                  Enter a path and hit Go to list its contents.
                </p>
              ) : listing.error ? (
                <p className="text-sm text-gray-400 py-2">{listing.error}</p>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 font-mono mb-1">
                    {listing.path || path}
                  </p>
                  <pre className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-[11px] font-mono text-gray-700 whitespace-pre overflow-auto max-h-72">
                    {Array.isArray(listing.entries) && listing.entries.length > 0
                      ? listing.entries.join("\n")
                      : "(empty)"}
                  </pre>
                </div>
              )}

              {/* Download by filename */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={downloadName}
                  onChange={(event) => setDownloadName(event.target.value)}
                  placeholder="filename to download"
                  className={inputClass + " flex-1 min-w-0 font-mono"}
                />
                <a
                  href={downloadHref || undefined}
                  download
                  aria-disabled={!downloadHref}
                  onClick={(event) => {
                    if (!downloadHref) event.preventDefault();
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${
                    downloadHref
                      ? "border-gray-200 text-gray-700 hover:bg-gray-50"
                      : "border-gray-100 text-gray-300 pointer-events-none"
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </a>
              </div>

              {/* Upload to current path */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleUpload}
                  disabled={uploading || !selectedChild}
                  className="hidden"
                  id="files-panel-upload"
                />
                <label
                  htmlFor="files-panel-upload"
                  className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium transition-colors ${
                    uploading || !selectedChild
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-700 hover:bg-gray-50 cursor-pointer"
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>
                    {uploading
                      ? "Uploading…"
                      : `Upload to ${path.trim() || DEFAULT_PATH}`}
                  </span>
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
