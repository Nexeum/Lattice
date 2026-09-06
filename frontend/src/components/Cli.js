import React, { useRef, useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Terminal as TerminalIcon } from "lucide-react";

const API_BASE = "http://localhost:5001";

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  clearLine: "\x1b[2K\r",
};

const PROMPT = `${ANSI.green}$ ${ANSI.reset}`;

const HELP_LINES = [
  "Lattice Shell — available commands:",
  "  help          Show this message",
  "  clear         Clear the terminal",
  "  <anything>    Runs inside the attached container via sh -c",
  "",
  "Examples:",
  "  ls -la",
  "  ps aux",
  "  cat /etc/os-release",
];

const shortId = (id) => (typeof id === "string" ? id.slice(0, 12) : "");

const toCrlf = (text) => text.replace(/\r?\n/g, "\r\n");

export const Cli = ({ containerId, innerContainerId }) => {
  const wrapperRef = useRef(null);
  const termElRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);

  // Mutable terminal state — lives outside React's render cycle because
  // xterm's onData callback fires outside of it.
  const bufferRef = useRef("");
  const historyRef = useRef([]);
  const historyIndexRef = useRef(null);
  const busyRef = useRef(false);
  const targetRef = useRef({ containerId, innerContainerId });
  const prevInnerRef = useRef(innerContainerId);

  targetRef.current = { containerId, innerContainerId };

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#000000",
        foreground: "#d1d5db",
        cursor: "#4ade80",
        cursorAccent: "#000000",
        green: "#4ade80",
        selectionBackground: "rgba(74, 222, 128, 0.3)",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termElRef.current);
    termRef.current = term;
    fitRef.current = fitAddon;

    const safeFit = () => {
      const el = termElRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        fitAddon.fit();
      } catch (error) {
        console.error("Terminal fit failed:", error);
      }
    };

    const writePrompt = () => {
      term.write(PROMPT + bufferRef.current);
    };

    const redrawInputLine = () => {
      term.write(ANSI.clearLine);
      writePrompt();
    };

    const printBanner = () => {
      const { containerId: cid, innerContainerId: iid } = targetRef.current;
      const target = iid
        ? `nested container ${shortId(iid)} (via node ${shortId(cid)})`
        : cid
          ? `container ${shortId(cid)}`
          : null;
      term.writeln(`${ANSI.bold}Lattice Shell${ANSI.reset}`);
      term.writeln(
        ANSI.dim +
          (target
            ? `Connected to ${target}. Type 'help' for available commands.`
            : "No container attached. Commands cannot be executed.") +
          ANSI.reset
      );
      term.writeln("");
    };

    const executeRemote = async (command) => {
      const { containerId: cid, innerContainerId: iid } = targetRef.current;
      const encodedCommand = encodeURIComponent(command);
      const url = iid
        ? `${API_BASE}/node/${encodeURIComponent(cid)}/${encodeURIComponent(iid)}/${encodedCommand}`
        : `${API_BASE}/exe/${encodeURIComponent(cid)}/${encodedCommand}`;

      const response = await fetch(url, { method: "POST" });
      let data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }

      if (data && typeof data.error === "string" && data.error.length > 0) {
        return { error: data.error };
      }
      if (data && typeof data.output === "string") {
        return { output: data.output };
      }
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return { output: "" };
    };

    const runCommand = async (command) => {
      busyRef.current = true;
      term.write(`${ANSI.dim}…running${ANSI.reset}`);
      try {
        const result = await executeRemote(command);
        term.write(ANSI.clearLine);
        if (result.error) {
          term.write(toCrlf(`${ANSI.red}${result.error}${ANSI.reset}`));
          term.write("\r\n");
        } else if (result.output.length > 0) {
          term.write(toCrlf(result.output));
          if (!result.output.endsWith("\n")) term.write("\r\n");
        }
      } catch (error) {
        console.error("Command execution failed:", error);
        const message =
          error instanceof Error ? error.message : "unknown error";
        term.write(ANSI.clearLine);
        term.write(
          `${ANSI.red}Failed to execute command: ${message}${ANSI.reset}\r\n`
        );
      } finally {
        busyRef.current = false;
        // Re-render prompt plus anything typed while the command ran.
        writePrompt();
      }
    };

    const handleEnter = () => {
      if (busyRef.current) return; // one command in flight at a time

      const command = bufferRef.current.trim();
      bufferRef.current = "";
      historyIndexRef.current = null;
      term.write("\r\n");

      if (!command) {
        writePrompt();
        return;
      }

      historyRef.current = [...historyRef.current, command];

      if (command === "clear") {
        term.clear();
        term.write(ANSI.clearLine);
        writePrompt();
        return;
      }

      if (command === "help") {
        HELP_LINES.forEach((line) => term.writeln(line));
        writePrompt();
        return;
      }

      if (!targetRef.current.containerId) {
        term.writeln(
          `${ANSI.red}No container attached — cannot execute commands.${ANSI.reset}`
        );
        writePrompt();
        return;
      }

      runCommand(command);
    };

    const handleBackspace = () => {
      if (bufferRef.current.length === 0) return;
      bufferRef.current = bufferRef.current.slice(0, -1);
      if (!busyRef.current) term.write("\b \b");
    };

    const navigateHistory = (direction) => {
      if (busyRef.current) return;
      const history = historyRef.current;
      if (history.length === 0) return;

      const current = historyIndexRef.current;
      let next;
      if (direction === "up") {
        next = current === null ? history.length - 1 : Math.max(current - 1, 0);
      } else {
        if (current === null) return;
        next = current + 1 >= history.length ? null : current + 1;
      }

      historyIndexRef.current = next;
      bufferRef.current = next === null ? "" : history[next];
      redrawInputLine();
    };

    const handlePrintable = (chunk) => {
      if (chunk.length === 0) return;
      bufferRef.current += chunk;
      if (!busyRef.current) term.write(chunk);
    };

    const handleData = (data) => {
      // Escape sequences arrive as a single chunk.
      if (data.startsWith("\x1b")) {
        if (data === "\x1b[A") navigateHistory("up");
        else if (data === "\x1b[B") navigateHistory("down");
        // Ignore all other control sequences (arrows left/right, F-keys, …).
        return;
      }

      let printable = "";
      for (const char of data) {
        if (char === "\r" || char === "\n") {
          handlePrintable(printable);
          printable = "";
          handleEnter();
        } else if (char === "\x7f") {
          handlePrintable(printable);
          printable = "";
          handleBackspace();
        } else if (char >= " ") {
          printable += char;
        }
        // Other control characters are dropped.
      }
      handlePrintable(printable);
    };

    const dataDisposable = term.onData(handleData);

    printBanner();
    writePrompt();

    // Fit once layout and fonts have settled, then track wrapper resizes.
    const rafId = requestAnimationFrame(safeFit);
    const settleTimer = setTimeout(safeFit, 50);
    const resizeObserver = new ResizeObserver(() => safeFit());
    if (wrapperRef.current) resizeObserver.observe(wrapperRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Intentionally mount-once: prop changes are read through targetRef.
  }, []);

  // Announce target changes (e.g. user selects a nested container)
  // without resetting scrollback.
  useEffect(() => {
    if (prevInnerRef.current === innerContainerId) return;
    prevInnerRef.current = innerContainerId;

    const term = termRef.current;
    if (!term) return;

    const message = innerContainerId
      ? `→ executing inside ${shortId(innerContainerId)}`
      : `→ back to node ${shortId(containerId)}`;

    term.write(ANSI.clearLine);
    term.writeln(`${ANSI.cyan}${message}${ANSI.reset}`);
    if (!busyRef.current) {
      term.write(PROMPT + bufferRef.current);
    }
  }, [innerContainerId, containerId]);

  return (
    <div
      ref={wrapperRef}
      className="bg-black rounded-2xl overflow-hidden flex flex-col h-full w-full"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-400 font-mono truncate">
              lattice shell
              {containerId ? ` — ${shortId(containerId)}` : ""}
              {innerContainerId ? ` › ${shortId(innerContainerId)}` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* xterm surface */}
      <div className="flex-1 min-h-0 px-2 py-2">
        <div ref={termElRef} className="h-full w-full" />
      </div>
    </div>
  );
};
