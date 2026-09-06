import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

import { subscribe } from "../lib/toast";

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 4;

const kindIcon = (kind) => {
  if (kind === "success") {
    return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />;
  }
  if (kind === "error") {
    return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
  }
  return <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />;
};

const ToastCard = ({ toast, onDismiss }) => {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`pointer-events-auto flex items-center space-x-3 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 transition-all duration-300 ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {kindIcon(toast.kind)}
      <span className="flex-1 text-sm text-gray-900">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const Toasts = () => {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef({});

  useEffect(() => {
    const timeouts = timeoutsRef.current;

    const unsubscribe = subscribe((incoming) => {
      setToasts((prev) => [incoming, ...prev]);
      timeouts[incoming.id] = setTimeout(() => {
        delete timeouts[incoming.id];
        setToasts((prev) => prev.filter((item) => item.id !== incoming.id));
      }, AUTO_DISMISS_MS);
    });

    return () => {
      unsubscribe();
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  const dismiss = (id) => {
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 pointer-events-none w-80 max-w-[calc(100vw-3rem)]">
      {toasts.slice(0, MAX_VISIBLE).map((item) => (
        <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
      ))}
    </div>
  );
};
