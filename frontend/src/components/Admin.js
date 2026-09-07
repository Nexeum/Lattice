import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  ShieldOff,
  Users,
  Trash2,
  Plus,
  Lock,
  Server,
  AlertCircle,
  RefreshCw,
  Loader,
  ScrollText,
  Search
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized, getRole } from "../lib/api";
import { toast } from "../lib/toast";

const AUTH_API = "http://localhost:5005";
const CONTAINERS_API = "http://localhost:5001";

// Pull the human-readable detail out of a backend error body, if any.
const readErrorDetail = async (response) => {
  try {
    const body = await response.json();
    const detail = body?.detail || body?.error || body?.message;
    return detail ? String(detail) : null;
  } catch {
    return null;
  }
};

const RolePill = ({ role }) => (
  <span
    className={`px-2 py-1 rounded-full text-xs font-medium ${
      role === "admin"
        ? "bg-purple-100 text-purple-700"
        : "bg-gray-100 text-gray-600"
    }`}
  >
    {role}
  </span>
);

// Map an event type to a small palette bucket for its chip.
const classifyEventType = (type) => {
  const value = String(type || "").toLowerCase();
  if (
    value.endsWith("_failed") ||
    value === "probe_restart" ||
    value === "deploy_rejected"
  ) {
    return "red";
  }
  if (
    value.startsWith("deploy") ||
    value === "scale_up" ||
    value.endsWith("_deployed")
  ) {
    return "green";
  }
  if (
    value === "self_heal" ||
    value.endsWith("_restarted") ||
    value === "deploy_pending"
  ) {
    return "amber";
  }
  return "gray";
};

const CHIP_CLASSES = {
  red: "bg-red-100 text-red-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600"
};

const TypeChip = ({ type }) => (
  <span
    className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
      CHIP_CLASSES[classifyEventType(type)]
    }`}
  >
    {type || "unknown"}
  </span>
);

const UsersSection = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${AUTH_API}/users`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Users endpoint responded with ${response.status}`);
      }
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Could not load users. Make sure the auth service is running on port 5005.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleRole = async (user) => {
    const nextRole = user.role === "admin" ? "user" : "admin";
    setBusyId(user.id);
    try {
      const response = await fetch(
        `${AUTH_API}/users/${encodeURIComponent(user.id)}/role`,
        {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole })
        }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(detail || `Role update failed with status ${response.status}`);
      }
      toast.success(`${user.email} is now ${nextRole === "admin" ? "an admin" : "a user"}`);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the role");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) {
      return;
    }
    setBusyId(user.id);
    try {
      const response = await fetch(
        `${AUTH_API}/users/${encodeURIComponent(user.id)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(detail || `Delete failed with status ${response.status}`);
      }
      toast.success(`${user.email} deleted`);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the user");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-500" />
          <h2 className="text-xl font-medium text-gray-900">Users</h2>
          {!loading && !error && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
              {users.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchUsers}
          title="Refresh users"
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Manage who can sign in and who can administer Lattice. Admins can manage
        users, environments and every workspace.
      </p>

      {loading ? (
        <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm py-8">
          <Loader className="w-4 h-4 animate-spin" />
          <span>Loading users...</span>
        </div>
      ) : error ? (
        <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchUsers}
            title="Retry"
            className="ml-auto text-red-400 hover:text-red-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-3 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Email
                </th>
                <th className="py-3 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Role
                </th>
                <th className="py-3 text-xs font-medium text-gray-400 uppercase tracking-wide text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pr-4 text-sm text-gray-900 truncate max-w-xs">
                    {user.email}
                  </td>
                  <td className="py-3 pr-4">
                    <RolePill role={user.role} />
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleToggleRole(user)}
                        disabled={busyId === user.id}
                        className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200 rounded-full transition-all duration-200 disabled:opacity-50"
                      >
                        {user.role === "admin" ? (
                          <>
                            <ShieldOff className="w-3.5 h-3.5" />
                            <span>Make user</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-3.5 h-3.5" />
                            <span>Make admin</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        disabled={busyId === user.id}
                        title={`Delete ${user.email}`}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-50"
                      >
                        {busyId === user.id ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const EnvironmentsSection = () => {
  const [environments, setEnvironments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState("");
  const [newProtected, setNewProtected] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const fetchEnvironments = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const response = await fetch(`${CONTAINERS_API}/environments`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 404) {
        // Backend piece lands in parallel — degrade gracefully.
        setUnavailable(true);
        setEnvironments([]);
        return;
      }
      if (!response.ok) {
        throw new Error(`Environments endpoint responded with ${response.status}`);
      }
      const data = await response.json();
      setEnvironments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Could not load environments. Make sure the containers service is running on port 5001.");
      setEnvironments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const handleAddEnvironment = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const response = await fetch(`${CONTAINERS_API}/environments`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, protected: newProtected })
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(detail || `Create failed with status ${response.status}`);
      }
      setNewName("");
      setNewProtected(false);
      toast.success(`Environment "${name}" created`);
      await fetchEnvironments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the environment");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteEnvironment = async (env) => {
    if (!window.confirm(`Delete environment "${env.name}"?`)) {
      return;
    }
    setRemovingId(env.id);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/environments/${encodeURIComponent(env.id)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(detail || `Delete failed with status ${response.status}`);
      }
      toast.success(`Environment "${env.name}" deleted`);
      await fetchEnvironments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the environment");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Lock className="w-5 h-5 text-gray-500" />
          <h2 className="text-xl font-medium text-gray-900">Environments</h2>
          {!loading && !error && !unavailable && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
              {environments.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchEnvironments}
          title="Refresh environments"
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Deployment gates for CD. Protected environments require manual approval
        before CI deploys.
      </p>

      {loading ? (
        <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm py-8">
          <Loader className="w-4 h-4 animate-spin" />
          <span>Loading environments...</span>
        </div>
      ) : unavailable ? (
        <div className="flex items-center space-x-2 text-orange-600 text-sm bg-orange-50 px-4 py-3 rounded-xl border border-orange-100">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            Environments are not available yet on this backend. This section
            will activate automatically once the containers service supports it.
          </span>
        </div>
      ) : error ? (
        <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchEnvironments}
            title="Retry"
            className="ml-auto text-red-400 hover:text-red-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {environments.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">
              No environments yet. Create the first one below.
            </p>
          ) : (
            environments.map((env) => (
              <div
                key={env.id}
                className="flex items-center justify-between px-4 py-3 border border-gray-100 rounded-xl"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {env.name}
                  </span>
                  {env.protected ? (
                    <span className="flex items-center space-x-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                      <Lock className="w-3 h-3" />
                      <span>Protected</span>
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                      Open
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteEnvironment(env)}
                  disabled={removingId === env.id}
                  title={`Delete ${env.name}`}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-50 flex-shrink-0"
                >
                  {removingId === env.id ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && !unavailable && !error && (
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <p className="text-sm font-medium text-gray-700">Add an environment</p>
          <input
            type="text"
            autoComplete="off"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={adding}
            placeholder="Name, e.g. production"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 disabled:opacity-50"
          />
          <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={newProtected}
              onChange={(e) => setNewProtected(e.target.checked)}
              disabled={adding}
              className="w-4 h-4 rounded border-gray-300 accent-black"
            />
            <span>Protected — require manual approval before CI deploys</span>
          </label>
          <button
            onClick={handleAddEnvironment}
            disabled={adding || !newName.trim()}
            className="w-full px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {adding ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add Environment
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

const AuditLogSection = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    try {
      const response = await fetch(`${CONTAINERS_API}/events?limit=100`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 404) {
        setUnavailable(true);
        setEvents([]);
        return;
      }
      if (!response.ok) {
        throw new Error(`Events endpoint responded with ${response.status}`);
      }
      const data = await response.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      // Network/parse failures degrade gracefully rather than crashing the page.
      setUnavailable(true);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Distinct types present, sorted, for the dropdown. Recomputed only on data change.
  const availableTypes = useMemo(() => {
    const seen = new Set();
    events.forEach((event) => {
      if (event && event.type) seen.add(String(event.type));
    });
    return Array.from(seen).sort();
  }, [events]);

  const visibleEvents = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return events.filter((event) => {
      if (typeFilter && String(event?.type) !== typeFilter) return false;
      if (!needle) return true;
      const type = String(event?.type || "").toLowerCase();
      const message = String(event?.message || "").toLowerCase();
      return type.includes(needle) || message.includes(needle);
    });
  }, [events, filter, typeFilter]);

  const formatTimestamp = (ts) => {
    if (!ts) return "—";
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? String(ts) : date.toLocaleString();
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <ScrollText className="w-5 h-5 text-gray-500" />
          <h2 className="text-xl font-medium text-gray-900">Audit Log</h2>
          {!loading && !unavailable && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
              {events.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchEvents}
          title="Refresh audit log"
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Platform-wide activity across every workspace, newest first. Deploys,
        scaling, self-healing and failures are recorded here.
      </p>

      {loading ? (
        <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm py-8">
          <Loader className="w-4 h-4 animate-spin" />
          <span>Loading audit log...</span>
        </div>
      ) : unavailable ? (
        <div className="flex items-center space-x-2 text-orange-600 text-sm bg-orange-50 px-4 py-3 rounded-xl border border-orange-100">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            Audit log unavailable. Make sure the containers service is running
            on port 5001.
          </span>
          <button
            onClick={fetchEvents}
            title="Retry"
            className="ml-auto text-orange-400 hover:text-orange-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          No events recorded yet.
        </p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoComplete="off"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by type or message"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm bg-white text-gray-700"
            >
              <option value="">All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {visibleEvents.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No events match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-3 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Time
                    </th>
                    <th className="py-3 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="py-3 pr-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Message
                    </th>
                    <th className="py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Actor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event, index) => (
                    <tr
                      key={`${event?.ts ?? "no-ts"}-${index}`}
                      className="border-b border-gray-50 last:border-0 align-top"
                    >
                      <td className="py-3 pr-4 text-xs text-gray-500 whitespace-nowrap">
                        {formatTimestamp(event?.ts)}
                      </td>
                      <td className="py-3 pr-4">
                        <TypeChip type={event?.type} />
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-900">
                        {event?.message || "—"}
                      </td>
                      <td className="py-3 text-xs">
                        {event?.actor ? (
                          <span className="font-mono text-gray-700">
                            {event.actor}
                          </span>
                        ) : (
                          <span className="text-gray-400">system</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const Admin = () => {
  const isAdmin = getRole() === "admin";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="max-w-md mx-auto mt-16 bg-white rounded-2xl p-8 border border-gray-100 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-2xl mb-4">
              <Shield className="w-6 h-6 text-gray-400" />
            </div>
            <h1 className="text-2xl font-light text-gray-900 mb-2">Admins only</h1>
            <p className="text-gray-600">
              This page is reserved for administrators. Ask an admin to grant
              you the role if you need access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-light text-gray-900 mb-2">Administration</h1>
          <p className="text-gray-600">
            Manage users, roles and deployment environments
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <UsersSection />
          <div className="space-y-6">
            <EnvironmentsSection />

            {/* Hosts note */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <div className="flex items-center space-x-2 mb-2">
                <Server className="w-5 h-5 text-gray-500" />
                <h2 className="text-xl font-medium text-gray-900">Docker Hosts</h2>
              </div>
              <p className="text-sm text-gray-500">
                Docker hosts are managed from the{" "}
                <Link
                  to="/nodesly"
                  className="text-gray-900 font-medium hover:underline"
                >
                  Workspaces page
                </Link>{" "}
                — use the Hosts button there to add or remove remote daemons.
              </p>
            </div>
          </div>
        </div>

        {/* Audit log spans the full width below the two-column grid */}
        <div className="mt-6">
          <AuditLogSection />
        </div>
      </div>
    </div>
  );
};
