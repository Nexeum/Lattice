// Collapsible "Labs" card for the workspace page. Labs are plugins that ship
// a lab.json ({title, steps: [{title, instructions, check}]}). Each step's
// `check` command is executed inside the workspace container; passing checks
// advance a stepper whose progress persists in localStorage.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const CONTAINERS_API = "http://localhost:5001";
const PACKAGES_API = "http://localhost:5003";

const progressKey = (parentId, packageId) =>
  `lattice-lab-${parentId}-${packageId}`;

const readProgress = (parentId, packageId, stepCount) => {
  try {
    const raw = localStorage.getItem(progressKey(parentId, packageId));
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0) return 0;
    return Math.min(value, stepCount);
  } catch {
    return 0;
  }
};

const writeProgress = (parentId, packageId, value) => {
  try {
    localStorage.setItem(progressKey(parentId, packageId), String(value));
  } catch {
    /* storage full/blocked — progress just won't persist */
  }
};

const clearProgress = (parentId, packageId) => {
  try {
    localStorage.removeItem(progressKey(parentId, packageId));
  } catch {
    /* ignore */
  }
};

const isLabFile = (file) =>
  String(file?.name || "").toLowerCase() === "lab.json";

/** Tolerant lab.json parser: returns {title, steps} or null when unusable. */
const parseLab = (raw) => {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    const steps = (Array.isArray(parsed.steps) ? parsed.steps : [])
      .filter((step) => step && typeof step === "object")
      .map((step, index) => ({
        title:
          typeof step.title === "string" && step.title.trim()
            ? step.title
            : `Step ${index + 1}`,
        instructions:
          typeof step.instructions === "string" ? step.instructions : "",
        check: typeof step.check === "string" ? step.check : "",
      }));
    if (steps.length === 0) return null;
    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title
          : "Untitled lab",
      steps,
    };
  } catch {
    return null;
  }
};

const INDENT_PATTERN = /^(\s{2,}|\t)/;

/**
 * Mono-block convention: consecutive indented lines become a <pre> block,
 * everything else joins into paragraphs.
 */
const instructionBlocks = (text) => {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i += 1;
      continue;
    }
    if (INDENT_PATTERN.test(lines[i])) {
      const code = [];
      while (i < lines.length && INDENT_PATTERN.test(lines[i])) {
        code.push(lines[i].replace(INDENT_PATTERN, ""));
        i += 1;
      }
      blocks.push({ type: "pre", text: code.join("\n") });
      continue;
    }
    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !INDENT_PATTERN.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }
  return blocks;
};

const Instructions = ({ text }) => (
  <div className="space-y-2">
    {instructionBlocks(text).map((block, index) =>
      block.type === "pre" ? (
        <pre
          key={index}
          className="bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-x-auto text-[13px] font-mono text-gray-800 whitespace-pre-wrap break-words"
        >
          {block.text}
        </pre>
      ) : (
        <p key={index} className="text-sm text-gray-600">
          {block.text}
        </p>
      )
    )}
  </div>
);

export const LabsPanel = ({ parentId }) => {
  const [expanded, setExpanded] = useState(false);
  const [labs, setLabs] = useState([]); // [{id, name, content?}]
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [fetched, setFetched] = useState(false);

  const [selected, setSelected] = useState(null); // {id, lab} | {id, invalid: true}
  const [labLoading, setLabLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const [checking, setChecking] = useState(false);
  const [checkFail, setCheckFail] = useState(null); // {output, attempt}
  const attemptRef = useRef(0);
  const requestRef = useRef(0);

  const fetchLabs = useCallback(async () => {
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoading(true);
    try {
      const response = await fetch(`${PACKAGES_API}/packages`, {
        headers: { ...authHeaders() },
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`packages responded with ${response.status}`);
      }
      const body = await response.json();
      const found = (Array.isArray(body) ? body : [])
        .filter((pkg) =>
          (Array.isArray(pkg?.files) ? pkg.files : []).some(isLabFile)
        )
        .map((pkg) => {
          const labFile = pkg.files.find(isLabFile);
          return {
            id: String(pkg._id),
            name: pkg.name || "unnamed package",
            content:
              labFile && typeof labFile.content === "string"
                ? labFile.content
                : null,
          };
        });
      if (requestRef.current === token) {
        setLabs(found);
        setLoadError(false);
        setFetched(true);
        setLoading(false);
      }
    } catch (err) {
      if (requestRef.current === token) {
        setLabs([]);
        setLoadError(true);
        setFetched(true);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    fetchLabs();
    return () => {
      requestRef.current += 1;
    };
  }, [expanded, fetchLabs]);

  const openLab = useCallback(
    async (entry) => {
      setLabLoading(true);
      setCheckFail(null);
      const token = requestRef.current + 1;
      requestRef.current = token;
      try {
        let content = entry.content;
        if (content === null || content === undefined) {
          // Package list may omit file contents — fetch the full package.
          const response = await fetch(
            `${PACKAGES_API}/packages/${encodeURIComponent(entry.id)}`,
            { headers: { ...authHeaders() } }
          );
          if (redirectIfUnauthorized(response)) return;
          if (!response.ok) {
            throw new Error(`package responded with ${response.status}`);
          }
          const body = await response.json();
          const labFile = (Array.isArray(body?.files) ? body.files : []).find(
            isLabFile
          );
          content = labFile && typeof labFile.content === "string"
            ? labFile.content
            : null;
        }
        if (requestRef.current !== token) return;
        const lab = parseLab(content);
        if (!lab) {
          setSelected({ id: entry.id, name: entry.name, invalid: true });
        } else {
          setSelected({ id: entry.id, name: entry.name, lab });
          setStepIndex(readProgress(parentId, entry.id, lab.steps.length));
        }
      } catch (err) {
        if (requestRef.current === token) {
          setSelected({ id: entry.id, name: entry.name, invalid: true });
        }
      } finally {
        if (requestRef.current === token) setLabLoading(false);
      }
    },
    [parentId]
  );

  const closeLab = () => {
    setSelected(null);
    setCheckFail(null);
    setChecking(false);
  };

  const resetProgress = () => {
    if (!selected?.lab) return;
    clearProgress(parentId, selected.id);
    setStepIndex(0);
    setCheckFail(null);
  };

  const runCheck = async () => {
    const lab = selected?.lab;
    const step = lab?.steps?.[stepIndex];
    if (!step || !parentId || checking) return;
    setChecking(true);
    setCheckFail(null);
    const token = requestRef.current + 1;
    requestRef.current = token;
    try {
      // Body-based exec: the check command may contain slashes, quotes and
      // redirects, which break the path-based /exe route. Pass is decided by
      // the real shell exit code, not by whether stdout was empty.
      const response = await fetch(`${CONTAINERS_API}/exec`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ container_id: parentId, command: step.check }),
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`check responded with ${response.status}`);
      }
      const body = await response.json();
      if (requestRef.current !== token) return;
      const passed = body && body.exit_code === 0;
      if (passed) {
        const next = stepIndex + 1;
        writeProgress(parentId, selected.id, next);
        setStepIndex(next);
        if (next >= lab.steps.length) {
          toast.success("Lab completed 🎉");
        } else {
          toast.success(`Step ${stepIndex + 1} complete — on to the next one`);
        }
      } else {
        attemptRef.current += 1;
        setCheckFail({
          output: String(body?.error || body?.output || "").trim(),
          attempt: attemptRef.current,
        });
      }
    } catch (err) {
      if (requestRef.current === token) {
        attemptRef.current += 1;
        setCheckFail({
          output: "The check could not be run — is the workspace running?",
          attempt: attemptRef.current,
        });
      }
    } finally {
      if (requestRef.current === token) setChecking(false);
    }
  };

  const lab = selected?.lab || null;
  const totalSteps = lab ? lab.steps.length : 0;
  const completed = lab ? stepIndex >= totalSteps : false;
  const currentStep = lab && !completed ? lab.steps[stepIndex] : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      {/* Local keyframes for the "not yet" shake — keeps the file self-contained. */}
      <style>{`
        @keyframes lattice-lab-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
      `}</style>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center space-x-2 min-w-0 text-left"
          title={expanded ? "Collapse labs" : "Expand labs"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
          )}
          <GraduationCap className="w-4 h-4 flex-shrink-0 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Labs</span>
          {!expanded && fetched && labs.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-mono">
              {labs.length}
            </span>
          )}
        </button>
        {expanded && (
          <button
            onClick={fetchLabs}
            disabled={loading}
            title="Refresh labs"
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-4">
          {!selected ? (
            /* ------------------------------------------------ lab list --- */
            loading && !fetched ? (
              <div className="flex items-center space-x-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading labs…</span>
              </div>
            ) : loadError ? (
              <p className="text-sm text-gray-400 py-2">
                Labs aren't available right now — is the packages service
                running?
              </p>
            ) : labs.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No labs installed — check the App Catalog on the Dashboard.
              </p>
            ) : (
              <div className="space-y-2">
                {labs.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => openLab(entry)}
                    disabled={labLoading}
                    className="w-full flex items-center space-x-2 rounded-2xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 p-3 text-left transition-colors disabled:opacity-50"
                  >
                    <GraduationCap className="w-4 h-4 flex-shrink-0 text-gray-400" />
                    <span className="text-sm font-medium text-gray-800 truncate flex-1">
                      {entry.name}
                    </span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-300" />
                  </button>
                ))}
              </div>
            )
          ) : (
            /* -------------------------------------------------- stepper --- */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={closeLab}
                  className="flex items-center space-x-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>All labs</span>
                </button>
                {lab && (
                  <button
                    onClick={resetProgress}
                    className="text-xs text-gray-400 hover:text-gray-700 underline transition-colors"
                  >
                    Reset progress
                  </button>
                )}
              </div>

              {labLoading ? (
                <div className="flex items-center space-x-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading lab…</span>
                </div>
              ) : selected.invalid ? (
                <p className="text-sm text-gray-400 py-2">
                  This lab's lab.json could not be read.
                </p>
              ) : completed ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="text-lg font-semibold text-gray-800">
                    Lab completed 🎉
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    You finished all {totalSteps} steps of “{lab.title}”.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 font-mono">
                      Step {stepIndex + 1} of {totalSteps} · {lab.title}
                    </p>
                    <h4 className="text-sm font-semibold text-gray-800 mt-1">
                      {currentStep.title}
                    </h4>
                  </div>

                  {/* Progress dots */}
                  <div className="flex items-center space-x-1">
                    {lab.steps.map((_, index) => (
                      <span
                        key={index}
                        className={`h-1.5 rounded-full flex-1 ${
                          index < stepIndex
                            ? "bg-green-400"
                            : index === stepIndex
                            ? "bg-gray-400"
                            : "bg-gray-100"
                        }`}
                      />
                    ))}
                  </div>

                  <Instructions text={currentStep.instructions} />

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={runCheck}
                      disabled={checking || !parentId || !currentStep.check}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
                    >
                      {checking ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>Check</span>
                    </button>
                    {!currentStep.check && (
                      <span className="text-xs text-gray-400">
                        This step has no check command.
                      </span>
                    )}
                  </div>

                  {checkFail && (
                    <div
                      key={checkFail.attempt}
                      style={{ animation: "lattice-lab-shake 0.4s ease" }}
                      className="rounded-2xl border border-red-100 bg-red-50 p-3"
                    >
                      <p className="text-sm text-red-600 font-medium">
                        Not yet — keep trying
                      </p>
                      {checkFail.output ? (
                        <details className="mt-1">
                          <summary className="text-xs text-red-400 cursor-pointer select-none">
                            Command output
                          </summary>
                          <pre className="mt-1 bg-white border border-red-100 text-red-600 rounded-xl p-2 text-[11px] font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                            {checkFail.output}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
