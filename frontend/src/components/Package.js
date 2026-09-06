import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Layers,
  GitPullRequest,
  PauseCircle,
  BadgeCheck,
  Users,
  Plus,
  Rocket
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
  if (status === "awaiting_approval") {
    return <PauseCircle className={`${className} text-amber-500 shrink-0`} />;
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

const RunDetail = ({ run, onBack, onRunUpdate }) => {
  const [expandedSteps, setExpandedSteps] = useState({});
  const [decidingAction, setDecidingAction] = useState(null);
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

  // Approve or reject a deployment that is waiting for a human decision.
  // Approving actually performs the deploy server-side, so it can take a
  // while — the button shows a "Deploying…" spinner until it resolves.
  const handleDeployDecision = async (action) => {
    if (decidingAction) return;
    setDecidingAction(action);
    try {
      const response = await fetch(`${CI_BASE}/ci/runs/${run._id}/${action}`, {
        method: "POST",
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        if (response.status === 403) {
          toast.error("Only the owner or an admin can approve");
          return;
        }
        throw new Error(`Deploy ${action} failed (${response.status})`);
      }
      const updated = await response.json();
      if (updated && updated._id != null && typeof onRunUpdate === "function") {
        onRunUpdate(updated);
      }
      if (action === "approve") {
        toast.success(`Run #${run.number} approved`);
      } else {
        toast.info(`Deployment for run #${run.number} rejected`);
      }
    } catch (error) {
      console.error("Error deciding deployment:", error);
      toast.error(
        action === "approve"
          ? "Could not approve the deployment. Please try again."
          : "Could not reject the deployment. Please try again."
      );
    } finally {
      setDecidingAction(null);
    }
  };

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
          {run.deploy && (run.deploy.workspace || run.deploy.environment) && (
            <span className="hidden sm:inline-flex items-center gap-1 shrink-0">
              {run.deploy.workspace && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-[11px] font-medium font-mono">
                  <Rocket className="w-3 h-3" />
                  {run.deploy.workspace}
                </span>
              )}
              {run.deploy.environment && (
                <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-[11px] font-medium">
                  {run.deploy.environment}
                </span>
              )}
            </span>
          )}
          {isActiveRun(run.status) && (
            <span
              className={`text-xs font-medium shrink-0 ${
                run.status === "queued" ? "text-gray-500" : "text-amber-600"
              }`}
            >
              {runStatusLabel(run)}
            </span>
          )}
          {run.status === "awaiting_approval" && (
            <span className="text-xs font-medium text-amber-600 shrink-0">
              Awaiting approval
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

      {run.status === "awaiting_approval" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <PauseCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">
                This run wants to deploy to {run.deploy?.workspace || "a workspace"} (
                {run.deploy?.environment || "unknown environment"})
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Approving starts the deployment immediately.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleDeployDecision("approve")}
              disabled={decidingAction != null}
              className={`inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium ${
                decidingAction != null ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              {decidingAction === "approve" && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span>{decidingAction === "approve" ? "Deploying…" : "Approve"}</span>
            </button>
            <button
              onClick={() => handleDeployDecision("reject")}
              disabled={decidingAction != null}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 bg-white rounded-xl transition-colors ${
                decidingAction != null ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              {decidingAction === "reject" && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span>{decidingAction === "reject" ? "Rejecting…" : "Reject"}</span>
            </button>
          </div>
        </div>
      )}

      {run.deploy_result && (
        <div
          className={`flex items-start gap-2 px-4 py-2.5 text-sm border-b ${
            run.deploy_result.ok
              ? "text-green-700 bg-green-50 border-green-100"
              : "text-red-700 bg-red-50 border-red-100"
          }`}
        >
          <Rocket className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {run.deploy_result.ok ? "Deployed successfully" : "Deployment failed"}
            {run.deploy_result.detail ? ` — ${run.deploy_result.detail}` : ""}
          </span>
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
      <p className="text-xs text-gray-500 mb-2">
        {'Optional "deploy" key — {"workspace": "lat-xxxx", "environment": "production"} — pauses the run for approval before deploying.'}
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
  const [showBadge, setShowBadge] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState(false);
  const badgeCopyTimeoutRef = useRef(null);
  // Run ids whose SSE stream failed; those fall back to interval polling.
  const [sseFallbackIds, setSseFallbackIds] = useState([]);

  useEffect(() => {
    return () => {
      if (badgeCopyTimeoutRef.current) {
        clearTimeout(badgeCopyTimeoutRef.current);
      }
    };
  }, []);

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

  // The public CI badge for this plugin (served by the CI service, no auth).
  const badgeUrl = `${CI_BASE}/ci/${packageId}/badge.svg`;
  const badgeMarkdown = `![CI](${badgeUrl})`;

  const handleCopyBadge = async () => {
    try {
      await navigator.clipboard.writeText(badgeMarkdown);
      setBadgeCopied(true);
      badgeCopyTimeoutRef.current = setTimeout(
        () => setBadgeCopied(false),
        COPY_FEEDBACK_MS
      );
    } catch (error) {
      console.error("Error copying badge markdown:", error);
    }
  };

  // Merge a single updated run (e.g. from a deploy approve/reject response)
  // into the list, immutably, and let the toast bookkeeping see it.
  const handleRunUpdate = useCallback(
    (updated) => {
      if (!updated || updated._id == null) return;
      noteRunStatuses([updated]);
      setRuns((prev) =>
        prev.map((run) => (run._id === updated._id ? updated : run))
      );
    },
    [noteRunStatuses]
  );

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
    return (
      <RunDetail
        run={selectedRun}
        onBack={() => setSelectedRunId(null)}
        onRunUpdate={handleRunUpdate}
      />
    );
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
            onClick={() => setShowBadge((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-xl transition-colors ${
              showBadge
                ? "border-gray-300 bg-gray-100 text-gray-900"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            title="CI status badge"
          >
            <BadgeCheck className="w-4 h-4" />
            <span>Badge</span>
          </button>
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

      {showBadge && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <BadgeCheck className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">CI badge</span>
            <img src={badgeUrl} alt="CI status badge" className="h-5" />
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-mono text-gray-800 overflow-x-auto whitespace-nowrap">
              {badgeMarkdown}
            </code>
            <button
              onClick={handleCopyBadge}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200 rounded-lg transition-colors shrink-0"
              title="Copy badge markdown"
            >
              {badgeCopied ? (
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
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Paste this into your README — the badge is public, no token needed.
          </p>
        </div>
      )}

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
                <span
                  className={`text-xs shrink-0 ${
                    run.status === "awaiting_approval"
                      ? "text-amber-600 font-medium"
                      : "text-gray-500"
                  }`}
                >
                  {isActiveRun(run.status)
                    ? runStatusLabel(run)
                    : run.status === "awaiting_approval"
                    ? "Awaiting approval"
                    : duration || "—"}
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
/* Changesets ("plugin PRs"): review queue with per-file line diffs.   */
/* ------------------------------------------------------------------ */

// Refuse to run the O(n*m) LCS on very large files; fall back to showing
// the old and new contents side by side instead.
const DIFF_MAX_CELLS = 250000;

// Line-based diff via longest-common-subsequence. Returns a list of
// { type: "same" | "add" | "del", text } ops, or null when the inputs are
// too large to diff comfortably in the browser.
const diffLines = (oldText, newText) => {
  const oldLines = String(oldText).split("\n");
  const newLines = String(newText).split("\n");
  const rows = oldLines.length;
  const cols = newLines.length;
  if (rows * cols > DIFF_MAX_CELLS) return null;

  const lcs = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        oldLines[i] === newLines[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: "same", text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: "del", text: oldLines[i] });
      i += 1;
    } else {
      ops.push({ type: "add", text: newLines[j] });
      j += 1;
    }
  }
  while (i < rows) {
    ops.push({ type: "del", text: oldLines[i] });
    i += 1;
  }
  while (j < cols) {
    ops.push({ type: "add", text: newLines[j] });
    j += 1;
  }
  return ops;
};

const DIFF_LINE_STYLES = {
  add: "bg-green-50 text-green-800",
  del: "bg-red-50 text-red-700",
  same: "text-gray-500"
};
const DIFF_LINE_PREFIXES = { add: "+", del: "-", same: " " };

const DiffLineRows = ({ ops }) => (
  <pre className="text-xs font-mono leading-5 py-2 min-w-max">
    {ops.map((op, index) => (
      <div key={index} className={`px-3 ${DIFF_LINE_STYLES[op.type]}`}>
        <span className="inline-block w-4 select-none">
          {DIFF_LINE_PREFIXES[op.type]}
        </span>
        <span className="whitespace-pre">{op.text || " "}</span>
      </div>
    ))}
  </pre>
);

const FileDiff = ({ name, oldContent, newContent }) => {
  const isNewFile = oldContent == null;
  const proposed = newContent == null ? "" : String(newContent);
  const unchanged = !isNewFile && String(oldContent) === proposed;

  const ops = useMemo(() => {
    if (unchanged) return [];
    if (isNewFile) {
      return proposed.split("\n").map((text) => ({ type: "add", text }));
    }
    return diffLines(oldContent, proposed);
  }, [isNewFile, unchanged, oldContent, proposed]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-900 font-mono truncate">
          {name}
        </span>
        {isNewFile && (
          <span className="inline-flex items-center px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-[10px] font-medium shrink-0">
            new file
          </span>
        )}
      </div>
      {unchanged ? (
        <div className="px-3 py-3 text-xs text-gray-500">
          No changes to this file.
        </div>
      ) : ops ? (
        <div className="overflow-x-auto">
          <DiffLineRows ops={ops} />
        </div>
      ) : (
        // File too large for a line diff: old block and new block side by
        // side on large screens, stacked on small ones.
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
          <div className="overflow-x-auto">
            <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-red-600">
              Current
            </div>
            <pre className="text-xs font-mono leading-5 px-3 py-2 text-gray-700 min-w-max">
              {String(oldContent)}
            </pre>
          </div>
          <div className="overflow-x-auto">
            <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-green-700">
              Proposed
            </div>
            <pre className="text-xs font-mono leading-5 px-3 py-2 text-gray-700 min-w-max">
              {proposed}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

const ChangesetStatusDot = ({ status }) => {
  const color =
    status === "pending"
      ? "bg-amber-400"
      : status === "approved"
      ? "bg-green-500"
      : "bg-gray-300";
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${color}`}
      title={status}
    />
  );
};

const ChangesetsPanel = ({
  packageId,
  changesets,
  loading,
  error,
  onRefresh,
  packageFiles,
  onApproved
}) => {
  const [selected, setSelected] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [decidingAction, setDecidingAction] = useState(null);

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const openChangeset = async (entry) => {
    if (openingId) return;
    setOpeningId(entry._id);
    setDetailError(null);
    try {
      const response = await fetch(
        `${API_BASE}/packages/${packageId}/changesets/${entry._id}`,
        { headers: { ...authHeaders() } }
      );
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Changeset request failed (${response.status})`);
      }
      const data = await response.json();
      setSelected(data);
    } catch (fetchError) {
      console.error("Error fetching changeset:", fetchError);
      setDetailError("Could not load that changeset. Please try again.");
    } finally {
      setOpeningId(null);
    }
  };

  const handleDecision = async (action) => {
    if (!selected || decidingAction) return;
    setDecidingAction(action);
    try {
      const response = await fetch(
        `${API_BASE}/packages/${packageId}/changesets/${selected._id}/${action}`,
        { method: "POST", headers: { ...authHeaders() } }
      );
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        if (response.status === 409) {
          toast.error("This changeset is no longer pending.");
          setSelected(null);
          onRefresh();
          return;
        }
        if (response.status === 403) {
          toast.error(`You are not allowed to ${action} this changeset.`);
          return;
        }
        throw new Error(`Changeset ${action} failed (${response.status})`);
      }
      if (action === "approve") {
        toast.success("Changeset approved — a CI run was triggered");
        onApproved();
      } else {
        toast.info("Changeset rejected");
        onRefresh();
      }
      setSelected(null);
    } catch (decisionError) {
      console.error("Error updating changeset:", decisionError);
      toast.error(`Could not ${action} the changeset. Please try again.`);
    } finally {
      setDecidingAction(null);
    }
  };

  if (selected) {
    const changedFiles = Array.isArray(selected.files) ? selected.files : [];
    const created = formatCiTime(selected.created_at);
    const isPending = selected.status === "pending";
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSelected(null)}
              className="p-1 text-gray-500 hover:text-gray-900 transition-colors shrink-0"
              title="Back to changes"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <ChangesetStatusDot status={selected.status} />
            <span className="text-sm font-semibold text-gray-900 truncate">
              {selected.author_email || selected.author || "Unknown author"}
            </span>
            {created && (
              <span className="text-xs text-gray-500 shrink-0">{created}</span>
            )}
          </div>
          {isPending && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleDecision("approve")}
                disabled={decidingAction != null}
                className={`inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium ${
                  decidingAction != null ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {decidingAction === "approve" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>
                  {decidingAction === "approve" ? "Approving..." : "Approve"}
                </span>
              </button>
              <button
                onClick={() => handleDecision("reject")}
                disabled={decidingAction != null}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 bg-white rounded-xl transition-colors ${
                  decidingAction != null ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {decidingAction === "reject" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>
                  {decidingAction === "reject" ? "Rejecting..." : "Reject"}
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          {changedFiles.length > 0 ? (
            changedFiles.map((file) => {
              const current = (Array.isArray(packageFiles) ? packageFiles : []).find(
                (candidate) => candidate && candidate.name === file.name
              );
              return (
                <FileDiff
                  key={file.name}
                  name={file.name}
                  oldContent={current ? current.content : null}
                  newContent={file.content}
                />
              );
            })
          ) : (
            <p className="text-sm text-gray-500">This changeset has no files.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <GitPullRequest className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-900">Proposed changes</span>
        <span className="text-xs text-gray-500">
          {changesets.length} {changesets.length === 1 ? "changeset" : "changesets"}
        </span>
      </div>

      {(error || detailError) && (
        <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {error || detailError}
        </div>
      )}

      {loading && changesets.length === 0 ? (
        <div className="flex items-center justify-center py-14">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
        </div>
      ) : changesets.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {changesets.map((entry) => {
            const isPending = entry.status === "pending";
            const fileNames = Array.isArray(entry.files) ? entry.files : [];
            const created = formatCiTime(entry.created_at);
            const row = (
              <>
                <ChangesetStatusDot status={entry.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {entry.author_email || entry.author || "Unknown author"}
                    </span>
                    {fileNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center px-2 py-0.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-full text-[11px] font-mono"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">
                    {[entry.status, created].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {openingId === entry._id && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                )}
              </>
            );
            return isPending ? (
              <button
                key={entry._id}
                onClick={() => openChangeset(entry)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                {row}
              </button>
            ) : (
              <div
                key={entry._id}
                className="flex items-center gap-3 px-4 py-3 opacity-70"
              >
                {row}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-14 px-4">
          <GitPullRequest className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h4 className="text-base font-medium text-gray-900 mb-1">
            No proposed changes
          </h4>
          <p className="text-sm text-gray-600">
            Contributions from non-writers appear here for review.
          </p>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Releases: sidebar card listing releases with download + create.     */
/* ------------------------------------------------------------------ */

const ReleasesCard = ({ packageId }) => {
  const [releases, setReleases] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetchReleases = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/packages/${packageId}/releases`, {
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Releases request failed (${response.status})`);
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setReleases(
        [...list].sort(
          (a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
        )
      );
      setLoadError(null);
    } catch (error) {
      console.error("Error fetching releases:", error);
      setLoadError("Could not load releases.");
    }
  }, [packageId]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const closeModal = () => {
    setShowModal(false);
    setVersion("");
    setNotes("");
    setFormError(null);
  };

  const handleCreate = async () => {
    if (creating) return;
    const trimmedVersion = version.trim();
    if (!trimmedVersion) {
      setFormError("Version is required.");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const response = await fetch(`${API_BASE}/packages/${packageId}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ version: trimmedVersion, notes })
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        if (response.status === 403) {
          toast.error("Only writers can create releases");
          return;
        }
        throw new Error(`Release create failed (${response.status})`);
      }
      toast.success(`Release ${trimmedVersion} created`);
      closeModal();
      fetchReleases();
    } catch (error) {
      console.error("Error creating release:", error);
      toast.error("Could not create the release. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const releaseDownloadUrl = (releaseId) =>
    `${API_BASE}/packages/${packageId}/releases/${releaseId}/download?token=${encodeURIComponent(
      getToken() || ""
    )}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Releases</h3>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New release</span>
        </button>
      </div>

      {loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : releases.length > 0 ? (
        <div className="space-y-3">
          {releases.map((release) => {
            const releaseId = release?._id ?? release?.id;
            const created = formatCiTime(release?.created_at);
            const fileCount = Array.isArray(release?.files)
              ? release.files.length
              : 0;
            return (
              <div
                key={releaseId || release?.version}
                className="flex items-start gap-2"
              >
                <Tag className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {release?.version}
                    </span>
                    {releaseId != null && (
                      <a
                        href={releaseDownloadUrl(releaseId)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                  {release?.notes && (
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {release.notes}
                    </p>
                  )}
                  <span className="text-[11px] text-gray-400">
                    {[
                      created,
                      fileCount
                        ? `${fileCount} ${fileCount === 1 ? "file" : "files"}`
                        : null
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No releases yet.</p>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">New release</h3>
              <button
                onClick={closeModal}
                className="p-1 text-gray-500 hover:text-gray-900 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Version
            </label>
            <input
              type="text"
              value={version}
              onChange={(event) => {
                setVersion(event.target.value);
                setFormError(null);
              }}
              placeholder="1.0.0"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 mb-3"
            />
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="What changed in this release?"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className={`inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-medium ${
                  creating ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{creating ? "Creating..." : "Create release"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Collaborators: owner-only sidebar card (hidden on 403).             */
/* ------------------------------------------------------------------ */

const CollaboratorsCard = ({ packageId }) => {
  const [collaborators, setCollaborators] = useState(null);
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const fetchCollaborators = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE}/packages/${packageId}/collaborators`,
        { headers: { ...authHeaders() } }
      );
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        // Non-owners get a 403 — hide the block silently (same for any
        // other load failure; this is an owner-only convenience).
        setVisible(false);
        return;
      }
      const data = await response.json();
      setCollaborators(Array.isArray(data) ? data : []);
      setVisible(true);
    } catch (error) {
      console.error("Error fetching collaborators:", error);
      setVisible(false);
    }
  }, [packageId]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  const handleAdd = async () => {
    if (adding) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setAddError("Enter an email address.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch(
        `${API_BASE}/packages/${packageId}/collaborators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ email: trimmed })
        }
      );
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        if (response.status === 404) {
          setAddError("No user found with that email.");
          return;
        }
        throw new Error(`Add collaborator failed (${response.status})`);
      }
      toast.success(`Added ${trimmed} as a collaborator`);
      setEmail("");
      fetchCollaborators();
    } catch (error) {
      console.error("Error adding collaborator:", error);
      toast.error("Could not add the collaborator. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (collaborator) => {
    if (removingId != null) return;
    setRemovingId(collaborator.id);
    try {
      const response = await fetch(
        `${API_BASE}/packages/${packageId}/collaborators/${collaborator.id}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Remove collaborator failed (${response.status})`);
      }
      toast.success(`Removed ${collaborator.email}`);
      fetchCollaborators();
    } catch (error) {
      console.error("Error removing collaborator:", error);
      toast.error("Could not remove the collaborator. Please try again.");
    } finally {
      setRemovingId(null);
    }
  };

  if (!visible || collaborators == null) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Collaborators</h3>
      </div>

      {collaborators.length > 0 ? (
        <div className="space-y-2 mb-3">
          {collaborators.map((collaborator) => (
            <div key={collaborator.id} className="flex items-center gap-2">
              <span className="text-sm text-gray-700 truncate flex-1">
                {collaborator.email}
              </span>
              <button
                onClick={() => handleRemove(collaborator)}
                disabled={removingId != null}
                title={`Remove ${collaborator.email}`}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {removingId === collaborator.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic mb-3">No collaborators yet.</p>
      )}

      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setAddError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdd();
          }}
          placeholder="user@example.com"
          className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-60"
        >
          {adding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>Add</span>
        </button>
      </div>
      {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
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
  const [changesets, setChangesets] = useState([]);
  const [changesetsLoading, setChangesetsLoading] = useState(false);
  const [changesetsError, setChangesetsError] = useState(null);

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

  // Proposed changes ("plugin PRs"). Fetched on page load so the Changes tab
  // can show its pending-count badge, and refreshed on tab mount / actions.
  const fetchChangesets = useCallback(async () => {
    setChangesetsLoading(true);
    setChangesetsError(null);
    try {
      const response = await fetch(`${API_BASE}/packages/${id}/changesets`, {
        headers: { ...authHeaders() }
      });
      if (!response.ok) {
        if (redirectIfUnauthorized(response)) return;
        throw new Error(`Changesets request failed (${response.status})`);
      }
      const data = await response.json();
      setChangesets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching changesets:", error);
      setChangesetsError("Could not load proposed changes.");
    } finally {
      setChangesetsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchChangesets();
  }, [fetchChangesets]);

  // Approving a changeset applies its files and triggers a CI run
  // server-side, so refresh the package, the changesets and the runs list.
  const handleChangesetApproved = useCallback(async () => {
    await fetchPackage();
    await fetchChangesets();
    setCiRefreshKey((prev) => prev + 1);
  }, [fetchPackage, fetchChangesets]);

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
      // Non-writers get a 202: the upload became a pending changeset instead
      // of landing directly, so there is no new file and no CI run to show.
      if (response.status === 202) {
        toast.info("Contribution submitted for review");
        fetchChangesets();
        return;
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
  const pendingChangesetCount = changesets.filter(
    (entry) => entry && entry.status === "pending"
  ).length;

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
                onClick={() => setActiveTab("changes")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "changes"
                    ? "bg-black text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <GitPullRequest className="w-4 h-4" />
                <span>Changes</span>
                {pendingChangesetCount > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold ${
                      activeTab === "changes"
                        ? "bg-white text-black"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {pendingChangesetCount}
                  </span>
                )}
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
            ) : activeTab === "changes" ? (
              <ChangesetsPanel
                packageId={id}
                changesets={changesets}
                loading={changesetsLoading}
                error={changesetsError}
                onRefresh={fetchChangesets}
                packageFiles={files}
                onApproved={handleChangesetApproved}
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
          <div className="space-y-6">
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

            <ReleasesCard packageId={id} />
            <CollaboratorsCard packageId={id} />
          </div>
        </div>
      </div>
    </div>
  );
};
