import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { Search, Boxes, Package, Container } from "lucide-react";
import { authHeaders } from "../lib/api";

const ROOMS_API = "http://localhost:5002";
const PACKAGES_API = "http://localhost:5003";
const CONTAINERS_API = "http://localhost:5001";
const MAX_RESULTS = 8;

const TYPE_META = {
  workspace: { heading: "Workspaces", icon: Boxes },
  plugin: { heading: "Plugins", icon: Package },
  container: { heading: "Containers", icon: Container },
};

// Module-level pub/sub so any component (e.g. the navbar trigger) can open
// the palette without lifting state through the tree.
const openListeners = new Set();

export const openPalette = () => {
  openListeners.forEach((listener) => listener());
};

/** Docker Names can be an array and may carry a leading '/'. */
const containerName = (names) => {
  const first = Array.isArray(names) ? names[0] : names;
  return String(first || "").replace(/^\//, "");
};

const fetchList = async (url) => {
  const response = await fetch(url, { headers: { ...authHeaders() } });
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

const toWorkspaceEntries = (rooms) =>
  rooms
    .filter((room) => room && room._id)
    .map((room) => ({
      type: "workspace",
      label: room.name || "Untitled workspace",
      sublabel: room.owner || "",
      route: `/room/${room._id}`,
    }));

const toPluginEntries = (packages) =>
  packages
    .filter((pkg) => pkg && pkg._id)
    .map((pkg) => ({
      type: "plugin",
      label: pkg.name || "Unnamed plugin",
      sublabel: pkg.language || (pkg.version ? `v${pkg.version}` : ""),
      route: `/package/${pkg._id}`,
    }));

const toContainerEntries = (containers) =>
  containers
    .filter((item) => item && item.ID)
    .map((item) => ({
      type: "container",
      label: containerName(item.Names) || String(item.ID).slice(0, 12),
      sublabel: item.Image || "",
      route: `/container/${item.ID}`,
    }));

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [index, setIndex] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const fetchStartedRef = useRef(false);
  const history = useHistory();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, []);

  const show = useCallback(() => {
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);

  // Register with the module-level pub/sub for external triggers.
  useEffect(() => {
    openListeners.add(show);
    return () => {
      openListeners.delete(show);
    };
  }, [show]);

  // Build the search index on the first open per mount. Each source fails
  // independently and simply contributes no entries.
  useEffect(() => {
    if (!open || fetchStartedRef.current) return undefined;
    fetchStartedRef.current = true;
    let cancelled = false;

    const load = async () => {
      const [rooms, packages, containers] = await Promise.all([
        fetchList(`${ROOMS_API}/rooms`).catch(() => []),
        fetchList(`${PACKAGES_API}/packages`).catch(() => []),
        fetchList(`${CONTAINERS_API}/containers`).catch(() => []),
      ]);
      if (cancelled) return;
      setIndex([
        ...toWorkspaceEntries(rooms),
        ...toPluginEntries(packages),
        ...toContainerEntries(containers),
      ]);
      setLoaded(true);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Case-insensitive substring filter over label + sublabel, capped at 8.
  // The index is built in type order, so groups stay contiguous.
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? index.filter((entry) =>
          `${entry.label} ${entry.sublabel}`.toLowerCase().includes(term)
        )
      : index;
    return matches.slice(0, MAX_RESULTS);
  }, [index, query]);

  // Keep the selection in range whenever the result set changes.
  useEffect(() => {
    setSelected(0);
  }, [query]);

  const navigateTo = useCallback(
    (entry) => {
      close();
      history.push(entry.route);
    },
    [close, history]
  );

  // Global keyboard handling: ⌘K / Ctrl+K toggles, the rest only while open.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (open) {
          close();
        } else {
          show();
        }
        return;
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((prev) =>
          results.length > 0 ? (prev + 1) % results.length : 0
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        const entry = results[selected];
        if (entry) navigateTo(entry);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, results, selected, close, show, navigateTo]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center bg-black/30 backdrop-blur-sm px-4"
      onMouseDown={close}
    >
      <div
        className="mt-24 w-full max-w-lg self-start bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center space-x-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            autoComplete="off"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workspaces, plugins, containers…"
            className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {!loaded ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              Loading index…
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              No results
            </p>
          ) : (
            results.map((entry, idx) => {
              const meta = TYPE_META[entry.type];
              const Icon = meta.icon;
              const isFirstOfGroup =
                idx === 0 || results[idx - 1].type !== entry.type;
              return (
                <React.Fragment key={`${entry.type}-${entry.route}-${idx}`}>
                  {isFirstOfGroup && (
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {meta.heading}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigateTo(entry)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`w-full flex items-center space-x-3 px-4 py-2.5 text-left transition-colors ${
                      idx === selected ? "bg-gray-100" : ""
                    }`}
                  >
                    <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-900 truncate">
                        {entry.label}
                      </span>
                      {entry.sublabel && (
                        <span className="block text-xs text-gray-500 truncate">
                          {entry.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-[11px] text-gray-400">
            ↑↓ navigate · ↵ open · esc close
          </p>
        </div>
      </div>
    </div>
  );
};
