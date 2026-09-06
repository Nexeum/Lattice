import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";
import {
  Star,
  Code,
  FileText,
  Scale,
  Tag,
  Trash2,
  Upload,
  ArrowLeft,
  X,
  Copy,
  Check,
  BookOpen,
  Package as PackageIcon,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  Slash,
  Clock,
  Settings2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  History,
  FileArchive,
  Download,
  Layers
} from "lucide-react";
import { authHeaders, getToken, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const API_BASE = "http://localhost:5003";
const CI_BASE = "http://localhost:5001";
const README_NAMES = ["readme", "readme.md", "readme.txt"];
const COPY_FEEDBACK_MS = 2000;
const CI_POLL_MS = 2000;

// Packages that ship a file named exactly "stack.json" are stack templates.
const STACK_FILE_NAME = "stack.json";
const isStackFile = (file) =>
  Boolean(file) && typeof file.name === "string" && file.name === STACK_FILE_NAME;
const hasStackFile = (files) => (Array.isArray(files) ? files : []).some(isStackFile);

/* ------------------------------------------------------------------ */
/* Tiny hand-rolled markdown renderer.                                 */
/* Output is built as React elements (never dangerouslySetInnerHTML),  */
/* so any HTML in the source is escaped automatically by React.        */
/* ------------------------------------------------------------------ */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

const renderInline = (text) =>
  text.split(INLINE_PATTERN).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 bg-gray-100 rounded text-[13px] font-mono text-gray-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });

const renderMarkdown = (source) => {
  const lines = String(source).split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(
        <pre
          key={blocks.length}
          className="bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-x-auto text-[13px] font-mono text-gray-800 my-3"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2]);
      const headingClasses = {
        1: "text-2xl font-semibold text-gray-900 mt-6 mb-3 pb-2 border-b border-gray-200 first:mt-0",
        2: "text-xl font-semibold text-gray-900 mt-5 mb-2 pb-2 border-b border-gray-100 first:mt-0",
        3: "text-lg font-semibold text-gray-900 mt-4 mb-2 first:mt-0"
      };
      const HeadingTag = `h${level}`;
      blocks.push(
        <HeadingTag key={blocks.length} className={headingClasses[level]}>
          {content}
        </HeadingTag>
      );
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].trimStart().startsWith("- ")) {
        items.push(lines[i].trimStart().slice(2));
        i += 1;
      }
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-6 space-y-1 my-3 text-gray-700">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph: consume consecutive plain lines
    const paragraphLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].trimStart().startsWith("- ") &&
      !/^#{1,3}\s/.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={blocks.length} className="text-gray-700 leading-relaxed my-3 first:mt-0">
        {renderInline(paragraphLines.join(" "))}
      </p>
    );
  }

  return blocks;
};

/* ------------------------------------------------------------------ */
/* File viewer: header bar + line-numbered mono content + copy button, */
/* plus GitHub-style version history with view & rollback.             */
/* ------------------------------------------------------------------ */

const formatVersionSize = (length) => {
  if (typeof length !== "number" || Number.isNaN(length)) return null;
  if (length < 1024) return `${length} B`;
  return `${(length / 1024).toFixed(1)} KB`;
};

const formatVersionDate = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
};

const FileViewer = ({ file, packageId, onPackageUpdate, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef(null);

  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [versionViewError, setVersionViewError] = useState(null);
  const [loadingVersionId, setLoadingVersionId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoredNote, setRestoredNote] = useState(false);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const fileUrl = `${API_BASE}/packages/${packageId}/files/${encodeURIComponent(file.name)}`;

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const response = await fetch(
        `${API_BASE}/packages/${packageId}/files/${encodeURIComponent(file.name)}/versions`,
        { headers: { ...authHeaders() } }
      );
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Versions request failed (${response.status})`);
      }
      const data = await response.json();
      setVersions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching file versions:", error);
      setVersionsError("Could not load version history. Please try again.");
    } finally {
      setVersionsLoading(false);
    }
  }, [packageId, file.name]);

  const handleToggleHistory = () => {
    const opening = !showHistory;
    setShowHistory(opening);
    setViewingVersion(null);
    setVersionViewError(null);
    setRestoreError(null);
    if (opening) {
      fetchVersions();
    }
  };

  const handleViewVersion = async (entry, total) => {
    setLoadingVersionId(entry.id);
    setVersionViewError(null);
    try {
      const response = await fetch(`${fileUrl}/versions/${entry.id}`, {
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Version request failed (${response.status})`);
      }
      const data = await response.json();
      setViewingVersion({
        number: entry.number,
        total,
        content: data.content,
        uploadDate: data.uploadDate
      });
      setShowHistory(false);
      setRestoredNote(false);
    } catch (error) {
      console.error("Error fetching file version:", error);
      setVersionViewError("Could not load that version. Please try again.");
    } finally {
      setLoadingVersionId(null);
    }
  };

  const handleRestore = async (entry) => {
    const confirmed = window.confirm(
      `Restore "${file.name}" to version ${entry.number}? This creates a new version with that content.`
    );
    if (!confirmed) return;

    setRestoringId(entry.id);
    setRestoreError(null);
    setRestoredNote(false);
    try {
      const response = await fetch(`${fileUrl}/rollback/${entry.id}`, {
        method: "POST",
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        let message = `Could not restore this version (${response.status}).`;
        try {
          const body = await response.json();
          const serverMessage = body && (body.error || body.message || body.detail);
          if (serverMessage) {
            message = serverMessage;
          }
        } catch (parseError) {
          // Body was not JSON; keep the default message.
        }
        throw new Error(message);
      }
      const updatedPackage = await response.json();
      onPackageUpdate(updatedPackage);
      setViewingVersion(null);
      setRestoredNote(true);
      fetchVersions();
    } catch (error) {
      console.error("Error restoring file version:", error);
      setRestoreError(
        error instanceof Error && error.message
          ? error.message
          : "Could not restore this version. Please try again."
      );
    } finally {
      setRestoringId(null);
    }
  };

  const displayedContent = viewingVersion ? viewingVersion.content : file.content;
  const contentLines = displayedContent != null ? String(displayedContent).split("\n") : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayedContent || "");
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch (error) {
      console.error("Error copying file content:", error);
    }
  };

  const totalVersions = Array.isArray(versions) ? versions.length : 0;
  // API returns versions oldest first; number them 1..N and show newest first.
  const orderedVersions = Array.isArray(versions)
    ? versions.map((entry, index) => ({ ...entry, number: index + 1 })).reverse()
    : [];

  const viewingDate = viewingVersion ? formatVersionDate(viewingVersion.uploadDate) : null;

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-900 transition-colors"
            title="Back to files"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <FileText className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-900 font-mono truncate">
            {file.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleHistory}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              showHistory
                ? "text-gray-900 bg-gray-200 hover:bg-gray-200"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
            title="Version history"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>
          {contentLines != null && !showHistory && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Copy file content"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {restoredNote && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-green-700 bg-green-50 border-b border-green-100">
          <Check className="w-4 h-4 shrink-0" />
          <span>Restored as new version.</span>
        </div>
      )}

      {(restoreError || versionViewError) && (
        <div className="flex items-start gap-2 px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{restoreError || versionViewError}</span>
        </div>
      )}

      {viewingVersion && !showHistory && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-amber-800 bg-amber-50 border-b border-amber-100">
          <span className="min-w-0 truncate">
            Viewing version {viewingVersion.number} of {viewingVersion.total}
            {viewingDate ? ` — ${viewingDate}` : ""}
          </span>
          <button
            onClick={() => setViewingVersion(null)}
            className="font-medium text-amber-900 hover:underline shrink-0"
          >
            Back to current
          </button>
        </div>
      )}

      {showHistory ? (
        versionsLoading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        ) : versionsError ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-red-600 mb-3">{versionsError}</p>
            <button
              onClick={fetchVersions}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 underline"
            >
              Retry
            </button>
          </div>
        ) : orderedVersions.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {orderedVersions.map((entry) => {
              const isCurrent = entry.number === totalVersions;
              const date = formatVersionDate(entry.uploadDate);
              const size = formatVersionSize(entry.length);
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                  <History className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        Version {entry.number}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-[11px] font-medium">
                          current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {[date, size].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {!isCurrent && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleViewVersion(entry, totalVersions)}
                        disabled={loadingVersionId === entry.id || restoringId != null}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loadingVersionId === entry.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span>View</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleRestore(entry)}
                        disabled={restoringId != null || loadingVersionId != null}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {restoringId === entry.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Restoring...</span>
                          </>
                        ) : (
                          <span>Restore</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No version history for this file.
          </div>
        )
      ) : contentLines != null ? (
        <div className="overflow-x-auto">
          <pre className="text-[13px] font-mono leading-6 text-gray-800 py-3">
            {contentLines.map((line, index) => (
              <div key={index} className="flex hover:bg-gray-50">
                <span className="w-12 shrink-0 pr-4 text-right text-gray-400 select-none">
                  {index + 1}
                </span>
                <span className="pr-4 whitespace-pre">{line || " "}</span>
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-gray-500">
          No preview available for this file.
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* CI / Actions tab: runs list, run detail with step logs, polling.    */
/* ------------------------------------------------------------------ */

const formatCiTime = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatCiDuration = (seconds) => {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
};

const formatArtifactSize = (bytes) => {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const artifactDownloadUrl = (runId, artifactId) =>
  `${CI_BASE}/ci/runs/${runId}/artifacts/${artifactId}?token=${encodeURIComponent(
    getToken() || ""
  )}`;

const runDurationSeconds = (run) => {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const stepSum = steps.reduce(
    (acc, step) =>
      acc + (typeof step?.duration_seconds === "number" ? step.duration_seconds : 0),
    0
  );
  if (stepSum > 0) return stepSum;
  if (run.finished_at && run.created_at) {
    return (new Date(run.finished_at) - new Date(run.created_at)) / 1000;
  }
  return null;
};

// A run is "active" (still progressing, worth streaming/polling) while it is
// waiting in the queue, starting its runner, or actually running.
const ACTIVE_RUN_STATUSES = ["queued", "starting", "running"];
const isActiveRun = (status) => ACTIVE_RUN_STATUSES.includes(status);

// Human label for an active run; null for terminal states.
const runStatusLabel = (run) => {
  if (run.status === "queued") {
    return typeof run.queue_position === "number"
      ? `Queued · #${run.queue_position} in line`
      : "Queued";
  }
  if (run.status === "starting") return "Starting runner…";
  if (run.status === "running") return "In progress";
  return null;
};

const CiStatusIcon = ({ status, className = "w-4 h-4" }) => {
  if (status === "queued") {
    return <Clock className={`${className} text-gray-400 shrink-0`} />;
  }
  if (status === "starting" || status === "running") {
    return <Loader2 className={`${className} text-amber-500 animate-spin shrink-0`} />;
  }
  if (status === "success") {
    return <CheckCircle2 className={`${className} text-green-600 shrink-0`} />;
  }
  if (status === "failed") {
    return <XCircle className={`${className} text-red-600 shrink-0`} />;
  }
  if (status === "skipped") {
    return <Slash className={`${className} text-gray-400 shrink-0`} />;
  }
  return <Circle className={`${className} text-gray-300 shrink-0`} />;
};

const TriggerBadge = ({ trigger }) => (
  <span className="inline-flex items-center px-2 py-0.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-full text-[11px] font-medium">
    {trigger || "manual"}
  </span>
);

const RunDetail = ({ run, onBack }) => {
  const [expandedSteps, setExpandedSteps] = useState({});
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const artifacts = Array.isArray(run.artifacts) ? run.artifacts : [];
  const failedIndex = steps.findIndex((step) => step?.status === "failed");

  useEffect(() => {
    if (failedIndex >= 0) {
      setExpandedSteps((prev) => (prev[failedIndex] ? prev : { ...prev, [failedIndex]: true }));
    }
  }, [failedIndex]);

  const toggleStep = (index) =>
    setExpandedSteps((prev) => ({ ...prev, [index]: !prev[index] }));

  const created = formatCiTime(run.created_at);
  const finished = formatCiTime(run.finished_at);
  const duration = formatCiDuration(runDurationSeconds(run));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBack}
            className="p-1 text-gray-500 hover:text-gray-900 transition-colors shrink-0"
            title="Back to runs"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <CiStatusIcon status={run.status} className="w-5 h-5" />
          <span className="text-sm font-semibold text-gray-900 truncate">
            CI pipeline #{run.number}
          </span>
          <TriggerBadge trigger={run.trigger} />
          {isActiveRun(run.status) && (
            <span
              className={`text-xs font-medium shrink-0 ${
                run.status === "queued" ? "text-gray-500" : "text-amber-600"
              }`}
            >
              {runStatusLabel(run)}
            </span>
          )}
          {run.image && (
            <span
              className="text-[11px] font-mono text-gray-400 truncate hidden sm:inline"
              title={`Runner image: ${run.image}`}
            >
              {run.image}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          {created && <span>Started {created}</span>}
          {finished && <span>Finished {finished}</span>}
          {duration && <span className="font-medium text-gray-700">{duration}</span>}
        </div>
      </div>

      {run.error && (
        <div className="flex items-start gap-2 px-4 py-2.5 text-sm text-red-700 bg-red-50 border-b border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{run.error}</span>
        </div>
      )}

      {steps.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {steps.map((step, index) => {
            const expanded = Boolean(expandedSteps[index]);
            const stepDuration = formatCiDuration(step?.duration_seconds);
            return (
              <div key={index}>
                <button
                  onClick={() => toggleStep(index)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  )}
                  <CiStatusIcon status={step?.status} />
                  <span className="text-sm text-gray-900 font-medium truncate flex-1">
                    {step?.name || `Step ${index + 1}`}
                  </span>
                  {stepDuration && (
                    <span className="text-xs text-gray-500 shrink-0">{stepDuration}</span>
                  )}
                </button>
                {expanded && (
                  <div className="px-4 pb-3">
                    <pre className="bg-gray-900 text-gray-200 text-xs p-3 rounded-lg whitespace-pre-wrap max-h-80 overflow-auto font-mono">
                      {step?.output ? step.output : <span className="text-gray-500">No output.</span>}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-gray-500">
          This run has no steps.
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="border-t border-gray-200">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <FileArchive className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Artifacts</span>
            <span className="text-xs text-gray-500">
              {artifacts.length} {artifacts.length === 1 ? "file" : "files"}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {artifacts.map((artifact) => {
              const size = formatArtifactSize(artifact?.size);
              return (
                <div
                  key={artifact?.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <FileArchive className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-900 font-mono truncate flex-1">
                    {artifact?.name || "unnamed artifact"}
                  </span>
                  {size && (
                    <span className="text-xs text-gray-500 shrink-0">{size}</span>
                  )}
                  <a
                    href={artifactDownloadUrl(run._id, artifact?.id)}
                    download
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Workflow editor: edit lattice-ci.json in place, GitHub-style.       */
/* ------------------------------------------------------------------ */

const WORKFLOW_FILE_NAME = "lattice-ci.json";
const WORKFLOW_TEMPLATE = `{
  "image": "alpine:3.19",
  "steps": [
    { "name": "Install", "run": "sh install.sh" }
  ]
}`;

const findWorkflowFile = (files) =>
  (Array.isArray(files) ? files : []).find(
    (file) =>
      file &&
      typeof file.name === "string" &&
      file.name.toLowerCase() === WORKFLOW_FILE_NAME
  );

const WorkflowEditor = ({ packageId, files, onSaved, onClose }) => {
  const [text, setText] = useState(() => {
    const existing = findWorkflowFile(files);
    return existing && existing.content != null
      ? String(existing.content)
      : WORKFLOW_TEMPLATE;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedNote, setSavedNote] = useState(false);

  const handleChange = (event) => {
    setText(event.target.value);
    setSavedNote(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    setSavedNote(false);

    // Validate client-side before sending anything.
    try {
      JSON.parse(text);
    } catch (parseError) {
      setError(
        `Invalid JSON: ${
          parseError instanceof Error ? parseError.message : "could not parse"
        }`
      );
      return;
    }

    setSaving(true);
    try {
      const blob = new Blob([text], { type: "application/json" });
      const fd = new FormData();
      fd.append("file", blob, WORKFLOW_FILE_NAME);
      // No manual Content-Type: the browser sets the multipart boundary.
      const response = await fetch(`${API_BASE}/packages/${packageId}/files`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: fd
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Workflow save failed (${response.status})`);
      }
      setSavedNote(true);
      onSaved();
    } catch (saveError) {
      console.error("Error saving workflow file:", saveError);
      setError("Could not save the workflow. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-4 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-900 font-mono">
          {WORKFLOW_FILE_NAME}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        image: any Docker image · steps run in order inside /work/&lt;plugin&gt;
      </p>
      <p className="text-xs text-gray-500 mb-2">
        Files your steps write to artifacts/ are saved and downloadable from the run.
      </p>
      <textarea
        value={text}
        onChange={handleChange}
        rows={12}
        spellCheck={false}
        className="w-full bg-gray-900 text-gray-100 font-mono text-xs rounded-xl p-4 resize-y focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      {error && (
        <div className="flex items-start gap-2 mt-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedNote && (
        <div className="flex items-center gap-2 mt-2 text-sm text-green-700">
          <Check className="w-4 h-4 shrink-0" />
          <span>Saved — a run was triggered</span>
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium ${
            saving ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{saving ? "Saving..." : "Save"}</span>
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const ActionsPanel = ({ packageId, packageName, refreshKey, files, onWorkflowSaved }) => {
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);
  // Run ids whose SSE stream failed; those fall back to interval polling.
  const [sseFallbackIds, setSseFallbackIds] = useState([]);

  // Completion toasts: track the last known status per run id and which run
  // ids already fired a toast, so each run toasts exactly once no matter how
  // its final update arrives (SSE, polling, refetch or manual-run response).
  const runStatusesRef = useRef(new Map());
  const toastedRunIdsRef = useRef(new Set());
  const seededRunsRef = useRef(false);
  const packageNameRef = useRef(packageName);
  packageNameRef.current = packageName;

  const noteRunStatuses = useCallback((updatedRuns, { seed = false } = {}) => {
    updatedRuns.forEach((run) => {
      if (!run || run._id == null) return;
      const previous = runStatusesRef.current.get(run._id);
      const finished = run.status === "success" || run.status === "failed";
      if (seed) {
        // Initial load: runs that are already finished must never toast.
        if (finished) {
          toastedRunIdsRef.current.add(run._id);
        }
      } else if (
        finished &&
        !toastedRunIdsRef.current.has(run._id) &&
        (previous === undefined || isActiveRun(previous))
      ) {
        toastedRunIdsRef.current.add(run._id);
        const name = packageNameRef.current || packageId;
        if (run.status === "success") {
          toast.success(`CI run #${run.number} for ${name} succeeded`);
        } else {
          toast.error(`CI run #${run.number} for ${name} failed`);
        }
      }
      runStatusesRef.current.set(run._id, run.status);
    });
  }, [packageId]);

  const fetchRuns = useCallback(async () => {
    try {
      const response = await fetch(`${CI_BASE}/ci/${packageId}/runs`, {
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Runs request failed (${response.status})`);
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      noteRunStatuses(list, { seed: !seededRunsRef.current });
      seededRunsRef.current = true;
      setRuns(list);
      setRunsError(null);
    } catch (error) {
      console.error("Error fetching CI runs:", error);
      setRunsError("Could not load workflow runs.");
    } finally {
      setLoadingRuns(false);
    }
  }, [packageId, noteRunStatuses]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, refreshKey]);

  const selectedRun = selectedRunId
    ? runs.find((run) => run._id === selectedRunId)
    : null;

  // The opened run streams live over SSE while it is active — queued,
  // starting or running (unless its stream already failed, in which case it
  // stays on the polling fallback). The stream stays open through the whole
  // queued → starting → running lifecycle and closes on the final state.
  const streamingRunId =
    selectedRun &&
    isActiveRun(selectedRun.status) &&
    !sseFallbackIds.includes(selectedRun._id)
      ? selectedRun._id
      : null;

  useEffect(() => {
    if (!streamingRunId) return undefined;

    const url = `${CI_BASE}/ci/runs/${streamingRunId}/stream?token=${encodeURIComponent(
      getToken()
    )}`;
    const source = new EventSource(url);

    source.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data);
        if (!updated || updated._id !== streamingRunId) return;
        noteRunStatuses([updated]);
        setRuns((prev) =>
          prev.map((run) => (run._id === updated._id ? updated : run))
        );
        if (!isActiveRun(updated.status)) {
          source.close();
        }
      } catch (error) {
        console.error("Error parsing CI stream event:", error);
      }
    };

    source.onerror = () => {
      source.close();
      setSseFallbackIds((prev) =>
        prev.includes(streamingRunId) ? prev : [...prev, streamingRunId]
      );
    };

    return () => source.close();
  }, [streamingRunId, noteRunStatuses]);

  // Poll active runs not covered by the SSE stream (list entries that are
  // not open, plus the opened run when its stream failed).
  const runningKey = runs
    .filter((run) => isActiveRun(run.status) && run._id !== streamingRunId)
    .map((run) => run._id)
    .join(",");

  useEffect(() => {
    if (!runningKey) return undefined;
    const ids = runningKey.split(",");
    const poll = async () => {
      const updates = await Promise.all(
        ids.map(async (runId) => {
          try {
            const response = await fetch(`${CI_BASE}/ci/runs/${runId}`, {
              headers: { ...authHeaders() }
            });
            if (!response.ok) {
              if (redirectIfUnauthorized(response)) return null;
              return null;
            }
            return await response.json();
          } catch (error) {
            console.error("Error polling CI run:", error);
            return null;
          }
        })
      );
      noteRunStatuses(updates.filter(Boolean));
      setRuns((prev) =>
        prev.map((run) => updates.find((update) => update && update._id === run._id) || run)
      );
    };
    const interval = setInterval(poll, CI_POLL_MS);
    return () => clearInterval(interval);
  }, [runningKey, noteRunStatuses]);

  const handleRunWorkflow = async () => {
    if (triggering) return;
    setTriggering(true);
    setRunsError(null);
    try {
      const response = await fetch(`${CI_BASE}/ci/${packageId}/run?trigger=manual`, {
        method: "POST",
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Run request failed (${response.status})`);
      }
      const run = await response.json();
      if (run && run._id != null) {
        if (isActiveRun(run.status)) {
          toast.info(`CI run #${run.number} queued`);
        }
        // Covers the edge case where the run already finished by the time
        // the manual-run response arrives (previous status unknown → toast).
        noteRunStatuses([run]);
      }
      setRuns((prev) => [run, ...prev.filter((existing) => existing._id !== run._id)]);
      setSelectedRunId(run._id);
    } catch (error) {
      console.error("Error starting workflow run:", error);
      setRunsError("Could not start the workflow. Please try again.");
    } finally {
      setTriggering(false);
    }
  };

  if (selectedRun) {
    return <RunDetail run={selectedRun} onBack={() => setSelectedRunId(null)} />;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">Workflow runs</span>
          <span className="text-xs text-gray-500">
            {runs.length} {runs.length === 1 ? "run" : "runs"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflowEditor((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-xl transition-colors ${
              showWorkflowEditor
                ? "border-gray-300 bg-gray-100 text-gray-900"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            title="Configure the workflow"
          >
            <Settings2 className="w-4 h-4" />
            <span>Workflow</span>
          </button>
          <button
            onClick={handleRunWorkflow}
            disabled={triggering}
            className={`inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium ${
              triggering ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {triggering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>{triggering ? "Starting..." : "Run workflow"}</span>
          </button>
        </div>
      </div>

      {showWorkflowEditor && (
        <WorkflowEditor
          packageId={packageId}
          files={files}
          onSaved={onWorkflowSaved}
          onClose={() => setShowWorkflowEditor(false)}
        />
      )}

      {runsError && (
        <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {runsError}
        </div>
      )}

      {loadingRuns ? (
        <div className="flex items-center justify-center py-14">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
        </div>
      ) : runs.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {runs.map((run) => {
            const time = formatCiTime(run.created_at);
            const duration = formatCiDuration(runDurationSeconds(run));
            return (
              <button
                key={run._id}
                onClick={() => setSelectedRunId(run._id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
              >
                <CiStatusIcon status={run.status} className="w-5 h-5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">
                      CI pipeline #{run.number}
                    </span>
                    <TriggerBadge trigger={run.trigger} />
                  </div>
                  {time && <span className="text-xs text-gray-500">{time}</span>}
                </div>
                <span className="text-xs text-gray-500 shrink-0">
                  {isActiveRun(run.status) ? runStatusLabel(run) : duration || "—"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-14 px-4">
          <Play className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h4 className="text-base font-medium text-gray-900 mb-1">No runs yet</h4>
          <p className="text-sm text-gray-600">
            No runs yet — press Run workflow to start the first pipeline.
          </p>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export const Package = () => {
  const { id } = useParams();
  const history = useHistory();

  const [packageData, setPackageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [starred, setStarred] = useState(false);
  const [starring, setStarring] = useState(false);
  const [starError, setStarError] = useState(null);
  const [activeTab, setActiveTab] = useState("code");
  const [ciRefreshKey, setCiRefreshKey] = useState(0);

  const fetchPackage = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/packages/${id}`, {
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        setNotFound(true);
        return;
      }
      const data = await response.json();
      setPackageData(data);
      setNotFound(false);
    } catch (error) {
      console.error("Error fetching package:", error);
      setNotFound(true);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      await fetchPackage();
      if (!cancelled) {
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchPackage]);

  const handleStar = async () => {
    if (starred || starring || !packageData) return;

    const previousStars = typeof packageData.stars === "number" ? packageData.stars : 0;
    const nextStars = previousStars + 1;

    // Optimistic update (immutable)
    setStarring(true);
    setStarred(true);
    setStarError(null);
    setPackageData((prev) => (prev ? { ...prev, stars: nextStars } : prev));

    try {
      const response = await fetch(`${API_BASE}/packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ stars: nextStars })
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Star failed (${response.status})`);
      }
    } catch (error) {
      console.error("Error starring package:", error);
      // Rollback
      setStarred(false);
      setStarError("Could not star this plugin. Please try again.");
      setPackageData((prev) => (prev ? { ...prev, stars: previousStars } : prev));
    } finally {
      setStarring(false);
    }
  };

  // After a rollback the file service returns the updated package; keep the
  // package state and the open file viewer in sync with it (immutably).
  const handlePackageUpdate = useCallback((updatedPackage) => {
    if (!updatedPackage) return;
    setPackageData(updatedPackage);
    setSelectedFile((prev) => {
      if (!prev) return prev;
      const updatedFiles = Array.isArray(updatedPackage.files) ? updatedPackage.files : [];
      return updatedFiles.find((f) => f && f.name === prev.name) || prev;
    });
  }, []);

  // Saving lattice-ci.json uploads a new file version; the backend then
  // auto-triggers a push run, so refetch the package and refresh the runs.
  const handleWorkflowSaved = useCallback(async () => {
    await fetchPackage();
    setCiRefreshKey((prev) => prev + 1);
  }, [fetchPackage]);

  const handleUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/packages/${id}/files`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Upload failed (${response.status})`);
      }
      await fetchPackage();
      setUploadSuccess(`"${file.name}" contributed successfully.`);
      // The backend auto-triggers a CI run on upload (trigger=push); just
      // refresh the runs list so the new run shows up.
      setCiRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadError("Could not upload the file. Please try again.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete plugin "${packageData?.name || id}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`${API_BASE}/packages/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Delete failed (${response.status})`);
      }
      history.push("/");
    } catch (error) {
      console.error("Error deleting package:", error);
      setDeleteError("Could not delete the plugin. Please try again.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !packageData) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center py-20">
            <PackageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Plugin not found</h3>
            <p className="text-gray-600 mb-6">The requested plugin could not be found.</p>
            <button
              onClick={() => history.push("/")}
              className="inline-flex items-center space-x-2 px-6 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Lattice</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tags = Array.isArray(packageData.tags) ? packageData.tags : [];
  const files = Array.isArray(packageData.files) ? packageData.files : [];
  const starCount = typeof packageData.stars === "number" ? packageData.stars : 0;

  const readmeFile = files.find(
    (file) =>
      file &&
      typeof file.name === "string" &&
      README_NAMES.includes(file.name.toLowerCase()) &&
      file.content
  );

  const badges = [
    { label: packageData.type, icon: Tag },
    { label: packageData.language, icon: Code },
    { label: packageData.license, icon: Scale },
    { label: packageData.version ? `v${packageData.version}` : null, icon: null }
  ].filter((badge) => badge.label != null && badge.label !== "");

  const isStackTemplate = hasStackFile(files);

  const aboutRows = [
    { label: "Language", value: packageData.language, icon: Code },
    { label: "Version", value: packageData.version, icon: Tag },
    { label: "License", value: packageData.license, icon: Scale }
  ].filter((row) => row.value != null && row.value !== "");

  const contributeButton = (extraClasses) => (
    <label
      className={`inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium cursor-pointer ${
        uploading ? "opacity-60 pointer-events-none" : ""
      } ${extraClasses || ""}`}
    >
      <Upload className="w-4 h-4" />
      <span>{uploading ? "Uploading..." : "Contribute"}</span>
      <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
    </label>
  );

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Repo header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <PackageIcon className="w-5 h-5 text-gray-400 shrink-0" />
                <h1 className="text-2xl font-semibold text-gray-900 truncate">
                  {packageData.name || id}
                </h1>
              </div>
              {packageData.description && (
                <p className="text-gray-600 leading-relaxed mb-3">
                  {packageData.description}
                </p>
              )}
              {(badges.length > 0 || isStackTemplate) && (
                <div className="flex flex-wrap gap-2">
                  {isStackTemplate && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs font-medium">
                      <Layers className="w-3 h-3 text-purple-500" />
                      Stack
                    </span>
                  )}
                  {badges.map((badge, index) => {
                    const BadgeIcon = badge.icon;
                    return (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 text-gray-700 rounded-full text-xs font-medium"
                      >
                        {BadgeIcon && <BadgeIcon className="w-3 h-3 text-gray-500" />}
                        {badge.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 shrink-0">
              <button
                onClick={handleStar}
                disabled={starred || starring}
                title={starred ? "Starred" : "Star this plugin"}
                className={`inline-flex items-center rounded-xl border text-sm font-medium transition-colors ${
                  starred
                    ? "border-gray-200 bg-gray-50 text-gray-500 cursor-default"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 px-3 py-2">
                  <Star
                    className={`w-4 h-4 ${
                      starred ? "text-yellow-500 fill-yellow-400" : "text-gray-500"
                    }`}
                  />
                  <span>{starred ? "Starred" : "Star"}</span>
                </span>
                <span className="px-3 py-2 border-l border-gray-200 text-gray-900 font-semibold">
                  {starCount}
                </span>
              </button>

              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Delete plugin"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-xl transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleting ? "Deleting..." : "Delete"}</span>
              </button>
            </div>
          </div>

          {(starError || deleteError) && (
            <div className="mt-3 space-y-1">
              {starError && <p className="text-sm text-red-600">{starError}</p>}
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            </div>
          )}
        </div>

        {/* Main grid: code area + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Code column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tab switcher: Code | Actions */}
            <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl shadow-sm p-1">
              <button
                onClick={() => setActiveTab("code")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "code"
                    ? "bg-black text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Code className="w-4 h-4" />
                <span>Code</span>
              </button>
              <button
                onClick={() => setActiveTab("actions")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "actions"
                    ? "bg-black text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Play className="w-4 h-4" />
                <span>Actions</span>
              </button>
            </div>

            {activeTab === "actions" ? (
              <ActionsPanel
                packageId={id}
                packageName={packageData.name || id}
                refreshKey={ciRefreshKey}
                files={files}
                onWorkflowSaved={handleWorkflowSaved}
              />
            ) : selectedFile ? (
              <FileViewer
                file={selectedFile}
                packageId={id}
                onPackageUpdate={handlePackageUpdate}
                onClose={() => setSelectedFile(null)}
              />
            ) : (
              <>
                {/* File browser */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-900">Files</span>
                      <span className="text-xs text-gray-500">
                        {files.length} {files.length === 1 ? "file" : "files"}
                      </span>
                    </div>
                    {contributeButton()}
                  </div>

                  {(uploadError || uploadSuccess) && (
                    <div
                      className={`px-4 py-2.5 text-sm border-b ${
                        uploadError
                          ? "text-red-700 bg-red-50 border-red-100"
                          : "text-green-700 bg-green-50 border-green-100"
                      }`}
                    >
                      {uploadError || uploadSuccess}
                    </div>
                  )}

                  {files.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {files.map((file, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedFile(file)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors group"
                        >
                          {isStackFile(file) ? (
                            <Layers className="w-4 h-4 text-purple-500 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <span className="text-sm text-gray-900 font-mono group-hover:text-blue-600 group-hover:underline truncate">
                            {file?.name || "unnamed file"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-14 px-4">
                      <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <h4 className="text-base font-medium text-gray-900 mb-1">
                        No files yet
                      </h4>
                      <p className="text-sm text-gray-600 mb-5">
                        Be the first to contribute to this plugin.
                      </p>
                      {contributeButton()}
                    </div>
                  )}
                </div>

                {/* README */}
                {readmeFile && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <BookOpen className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-900">
                        {readmeFile.name}
                      </span>
                    </div>
                    <div className="px-6 py-5 text-[15px]">
                      {renderMarkdown(readmeFile.content)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">About</h3>

            {packageData.description ? (
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                {packageData.description}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic mb-4">No description provided.</p>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2.5 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Star className="w-4 h-4 text-gray-400" />
                <span>
                  <span className="font-semibold text-gray-900">{starCount}</span>{" "}
                  {starCount === 1 ? "star" : "stars"}
                </span>
              </div>
              {aboutRows.map((row) => {
                const RowIcon = row.icon;
                return (
                  <div key={row.label} className="flex items-center gap-2 text-sm text-gray-600">
                    <RowIcon className="w-4 h-4 text-gray-400" />
                    <span>
                      {row.label}:{" "}
                      <span className="font-medium text-gray-900">{row.value}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
