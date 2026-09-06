import React, { useRef, useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Terminal as TerminalIcon } from "lucide-react";
import { getToken } from "../lib/api";

const WS_BASE = "ws://localhost:5001";

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  clearLine: "\x1b[2K\r",
};

const shortId = (id) => (typeof id === "string" ? id.slice(0, 12) : "");

const targetLabel = (containerId, innerContainerId) =>
  innerContainerId
    ? `${shortId(innerContainerId)} (via ${shortId(containerId)})`
    : shortId(containerId);

const buildWsUrl = (containerId, innerContainerId, host) => {
  const params = new URLSearchParams({ token: getToken() });
  if (innerContainerId) params.set("inner", innerContainerId);
  if (host && host !== "local") params.set("host", host);
  return `${WS_BASE}/ws/terminal/${encodeURIComponent(containerId)}?${params.toString()}`;
};

export const Cli = ({ containerId, innerContainerId, host }) => {
  const wrapperRef = useRef(null);
  const termElRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const connectRef = useRef(null);

  // Reads refs only, so it is safe to call from either effect.
  const sendResize = () => {
    const ws = wsRef.current;
    const term = termRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !term) return;
    ws.send(
      JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
    );
  };
  const sendResizeRef = useRef(sendResize);
  sendResizeRef.current = sendResize;

  // Mount-once: terminal, fit addon, resize tracking, raw input forwarding.
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
        sendResizeRef.current();
      } catch (error) {
        console.error("Terminal fit failed:", error);
      }
    };

    // The remote shell owns echo, line editing, history, signals — every
    // keystroke goes straight to it as binary. When the socket is gone,
    // pressing Enter reconnects.
    const dataDisposable = term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
        return;
      }
      const closed =
        !ws ||
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING;
      if (closed && data.includes("\r") && connectRef.current) {
        connectRef.current();
      }
    });

    term.writeln(`${ANSI.bold}Lattice Shell${ANSI.reset}`);

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
  }, []);

  // Connection lifecycle: (re)connect from scratch whenever the target
  // changes; tear the socket down on change and unmount.
  useEffect(() => {
    const teardown = () => {
      const ws = wsRef.current;
      wsRef.current = null;
      if (!ws) return;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close(1000);
      } catch (error) {
        console.error("Terminal socket close failed:", error);
      }
    };

    const connect = () => {
      teardown();
      const term = termRef.current;
      if (!term) return;

      if (!containerId) {
        term.writeln(
          `${ANSI.dim}No container attached. Commands cannot be executed.${ANSI.reset}`
        );
        return;
      }

      // Status line is written without a trailing newline so it can be
      // replaced in place once the connection resolves.
      term.write(
        `${ANSI.dim}connecting to ${targetLabel(containerId, innerContainerId)}…${ANSI.reset}`
      );

      let ws;
      try {
        ws = new WebSocket(buildWsUrl(containerId, innerContainerId, host));
      } catch (error) {
        console.error("Terminal socket open failed:", error);
        term.write(ANSI.clearLine);
        term.writeln(
          `${ANSI.red}failed to open terminal connection${ANSI.reset}`
        );
        return;
      }
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        term.write(ANSI.clearLine);
        term.writeln(
          `${ANSI.green}connected to ${targetLabel(containerId, innerContainerId)}${ANSI.reset}`
        );
        sendResizeRef.current();
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        }
      };

      ws.onerror = (event) => {
        console.error("Terminal socket error:", event);
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        term.write(ANSI.clearLine);
        if (event.code === 4401) {
          term.writeln(
            `${ANSI.red}session expired — refresh and sign in${ANSI.reset}`
          );
        } else {
          term.writeln(
            `${ANSI.gray}session ended — press Enter to reconnect${ANSI.reset}`
          );
        }
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      connectRef.current = null;
      teardown();
    };
  }, [containerId, innerContainerId, host]);

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
