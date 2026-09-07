// A single "Export as stack" button for a workspace section header (not a
// panel). Fetches the workspace's stack definition and triggers a browser
// download of the pretty-printed stack.json. Self-contained and defensive:
// any failure surfaces as a toast rather than crashing.

import React, { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";

/** Trigger a client-side download of a text blob. */
const downloadBlob = (filename, text) => {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const ExportButton = ({ parentId, parentName }) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!parentId || exporting) return;
    setExporting(true);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/export`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`export responded with ${response.status}`);
      }
      const body = await response.json();
      const stack = body && body.stack ? body.stack : {};
      const count =
        typeof body?.services === "number"
          ? body.services
          : Array.isArray(stack?.services)
          ? stack.services.length
          : 0;
      const filename = `${parentName || "workspace"}-stack.json`;
      downloadBlob(filename, JSON.stringify(stack, null, 2));
      toast.success(
        `Exported ${count} ${count === 1 ? "service" : "services"}`
      );
    } catch (err) {
      toast.error("Could not export the stack. Is the containers service running?");
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting || !parentId}
      title="Export this workspace as a stack.json"
      className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
    >
      {exporting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      <span>Export as stack</span>
    </button>
  );
};
