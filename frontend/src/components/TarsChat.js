import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";

import { authHeaders } from "../lib/api";

const TARS_BASE = "http://localhost:5004";
const HISTORY_CAP = 20;
const GREETING =
  "Hola \u{1F44B} pregúntame por tus contenedores, deployments o eventos.";
// Module-level store so the conversation survives the panel (and component)
// unmounting. A page reload clears it, which is fine.
const store = {
  messages: [], // { role: "user" | "assistant" | "error", content: string }
  greeted: false,
  health: null, // null = not checked, else { configured: bool, detail?: string }
};

// Default setup copy: Tars runs on a local LLM via Ollama. When /health sends
// a `detail` field, that provider-specific message wins.
const DefaultSetupMessage = () => (
  <p className="text-sm text-gray-600 leading-relaxed">
    Tars usa un LLM local y gratuito vía Ollama. Instala Ollama (ollama.com),
    corre{" "}
    <code className="font-mono text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded">
      ollama pull llama3.2
    </code>{" "}
    y reinicia el servicio tars.
  </p>
);

const SetupCard = ({ detail }) => (
  <div className="flex-1 flex items-center justify-center p-6">
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-2xl mb-4">
        <Bot className="w-6 h-6 text-gray-500" />
      </div>
      {detail ? (
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
          {detail}
        </p>
      ) : (
        <DefaultSetupMessage />
      )}
    </div>
  </div>
);

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center space-x-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  </div>
);

const MessageBubble = ({ message }) => {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-black text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-red-50 text-red-700 border border-red-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-gray-100 text-gray-900 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
        {message.content}
      </div>
    </div>
  );
};

export const TarsChat = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(store.messages);
  const [health, setHealth] = useState(store.health);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const pushMessages = (added) => {
    store.messages = [...store.messages, ...added];
    setMessages(store.messages);
  };

  // Escape closes the panel (leave every other shortcut, e.g. Cmd+K, alone).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // First open: check /health once, then greet if configured.
  useEffect(() => {
    if (!open || store.health !== null) return;
    let cancelled = false;
    const check = async () => {
      let result = { configured: false };
      try {
        const response = await fetch(`${TARS_BASE}/health`, {
          headers: authHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          result = {
            configured: !!(data && data.configured),
            detail:
              data && typeof data.detail === "string" ? data.detail : undefined,
          };
        }
      } catch {
        // Connection refused / network error: treat as not configured.
      }
      store.health = result;
      if (result.configured && !store.greeted) {
        store.greeted = true;
        store.messages = [
          ...store.messages,
          { role: "assistant", content: GREETING },
        ];
      }
      if (!cancelled) {
        setHealth(result);
        setMessages(store.messages);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages, sending]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    pushMessages([{ role: "user", content }]);
    setSending(true);
    try {
      const history = store.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-HISTORY_CAP)
        .map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(`${TARS_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ messages: history }),
      });
      if (response.status === 503) {
        const notConfigured = { configured: false };
        store.health = notConfigured;
        setHealth(notConfigured);
        return;
      }
      if (!response.ok) {
        let detail = `Tars returned an error (${response.status}).`;
        try {
          const data = await response.json();
          detail = data.error || data.detail || data.reply || detail;
        } catch {
          // Non-JSON error body; keep the generic detail.
        }
        pushMessages([{ role: "error", content: detail }]);
        return;
      }
      const data = await response.json();
      if (data && typeof data.reply === "string") {
        pushMessages([{ role: "assistant", content: data.reply }]);
      } else {
        pushMessages([
          { role: "error", content: "Tars sent back an empty reply." },
        ]);
      }
    } catch {
      const notConfigured = { configured: false };
      store.health = notConfigured;
      setHealth(notConfigured);
    } finally {
      setSending(false);
    }
  };

  const onInputKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const inputRows = Math.min(3, Math.max(1, input.split("\n").length));
  const configured = health && health.configured;
  const checking = open && health === null;

  return (
    <>
      {/* Floating launcher (Toasts own the right corner). */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Tars — AI assistant"
        aria-label="Tars — AI assistant"
        className="fixed bottom-6 left-6 z-40 w-12 h-12 bg-black text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-800 transition-colors ring-4 ring-black/10"
      >
        <Bot className="w-5 h-5" />
        {!open && (
          <span className="absolute inset-0 rounded-full ring-2 ring-black/20 animate-ping pointer-events-none" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 left-6 z-40 w-[380px] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center space-x-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Tars</p>
              <p className="text-xs text-gray-500">ops assistant</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Tars"
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {checking && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
            </div>
          )}

          {!checking && !configured && (
            <SetupCard detail={health && health.detail} />
          )}

          {!checking && configured && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[120px]">
                {messages.map((message, index) => (
                  <MessageBubble key={index} message={message} />
                ))}
                {sending && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>

              {/* Input row */}
              <div className="flex items-end space-x-2 px-3 py-3 border-t border-gray-100 flex-shrink-0">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  rows={inputRows}
                  placeholder="Ask Tars…"
                  disabled={sending}
                  className="flex-1 resize-none px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                  className="w-9 h-9 flex-shrink-0 bg-black text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};
