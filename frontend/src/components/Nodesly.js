import React, { useState, useEffect, useCallback } from "react";
import { useHistory } from "react-router-dom";
import {
  Plus,
  Users,
  Lock,
  Settings,
  Eye,
  EyeOff,
  X,
  ArrowRight,
  Globe,
  Search,
  Trash2,
  AlertCircle,
  RefreshCw,
  Server,
  Loader
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const ROOMS_API = "http://localhost:5002";
const AUTH_API = "http://localhost:5005";
const CONTAINERS_API = "http://localhost:5001";

/** Shown whenever GET /hosts is unavailable — the local daemon always exists. */
const LOCAL_ONLY_HOSTS = [{ id: "local", name: "local", url: null, status: "up" }];

const HostStatusDot = ({ status }) => {
  const s = String(status || "").toLowerCase();
  const color =
    s === "up" ? "bg-green-500" : s === "down" ? "bg-red-500" : "bg-gray-300";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`}></span>;
};

// Workspace Card Component
const WorkspaceCard = ({ room, currentUserId, onJoin, onUpdate, onDelete }) => {
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const isPublic = !room.is_private;
  const isOwner = Boolean(currentUserId) && currentUserId === room.owner;

  const handleStateChange = async () => {
    if (isPublic) {
      // Going private requires a password
      setChangePasswordModal(true);
    } else {
      setSaving(true);
      await onUpdate(room._id, { is_private: false, password: "" });
      setSaving(false);
    }
  };

  const handleChangePasswordSubmit = async () => {
    setSaving(true);
    await onUpdate(room._id, { is_private: true, password });
    setSaving(false);
    setChangePasswordModal(false);
    setPassword("");
  };

  return (
    <>
      <div className="group bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-900 mb-1 truncate">
              {room.name || "Untitled workspace"}
            </h3>
            <div className="flex items-center space-x-2">
              {isPublic ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Globe className="w-4 h-4" />
                  <span className="text-sm font-medium">Public</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-orange-600">
                  <Lock className="w-4 h-4" />
                  <span className="text-sm font-medium">Private</span>
                </div>
              )}
              {room.owner && (
                <span className="text-xs text-gray-400 truncate">
                  by {room.owner}
                </span>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="flex items-center space-x-1">
              <button
                onClick={handleStateChange}
                disabled={saving}
                title={`Change to ${isPublic ? "private" : "public"}`}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200 disabled:opacity-50"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(room._id)}
                title="Delete workspace"
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => onJoin(room)}
            className="group/btn w-full flex items-center justify-center space-x-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium"
          >
            <span>Join Workspace</span>
            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
          </button>

          {isOwner && (
            <button
              onClick={handleStateChange}
              disabled={saving}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : `Change to ${isPublic ? "Private" : "Public"}`}
            </button>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {changePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setChangePasswordModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-gray-900">Set Password</h2>
              <button
                onClick={() => setChangePasswordModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="changePassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Password
                </label>
                <div className="relative">
                  <input
                    id="changePassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleChangePasswordSubmit}
                  disabled={!password.trim() || saving}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Set Password"}
                </button>
                <button
                  onClick={() => setChangePasswordModal(false)}
                  className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Nodesly = () => {
  const history = useHistory();
  const [rooms, setRooms] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [isPrivate, setIsPrivate] = useState("public");
  const [password, setPassword] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinRoom, setJoinRoom] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Anti-autofill: Chrome won't fill a readOnly input; lifted only while focused.
  const [searchReadOnly, setSearchReadOnly] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showJoinPassword, setShowJoinPassword] = useState(false);

  // Multi-host: available Docker hosts (containers service). Degrades to
  // local-only when the /hosts endpoint isn't available yet.
  const [hosts, setHosts] = useState(LOCAL_ONLY_HOSTS);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [hostsError, setHostsError] = useState(null);
  const [selectedHost, setSelectedHost] = useState("local");
  const [hostsModal, setHostsModal] = useState(false);
  const [newHostName, setNewHostName] = useState("");
  const [newHostUrl, setNewHostUrl] = useState("");
  const [addingHost, setAddingHost] = useState(false);
  const [addHostError, setAddHostError] = useState(null);
  const [removingHostId, setRemovingHostId] = useState(null);

  const fetchHosts = useCallback(async () => {
    setHostsLoading(true);
    setHostsError(null);
    try {
      const response = await fetch(`${CONTAINERS_API}/hosts`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Hosts endpoint responded with ${response.status}`);
      }
      const data = await response.json();
      setHosts(Array.isArray(data) && data.length > 0 ? data : LOCAL_ONLY_HOSTS);
    } catch (err) {
      // Backend piece may not be live yet — degrade to local-only silently.
      console.error("Could not load hosts, falling back to local:", err);
      setHosts(LOCAL_ONLY_HOSTS);
      setHostsError(
        "Could not load remote hosts. Only the local Docker daemon is available."
      );
    } finally {
      setHostsLoading(false);
    }
  }, []);

  const handleAddHost = async () => {
    const name = newHostName.trim();
    const url = newHostUrl.trim();
    if (!name || !url) return;
    setAddingHost(true);
    setAddHostError(null);
    try {
      const response = await fetch(`${CONTAINERS_API}/hosts`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name, url })
      });
      if (redirectIfUnauthorized(response)) return;
      let body = null;
      try {
        body = await response.json();
      } catch (parseErr) {
        console.error("Could not parse add-host response:", parseErr);
      }
      if (!response.ok) {
        throw new Error(
          String(body?.detail || `Adding the host failed with status ${response.status}`)
        );
      }
      if (body && body.name) {
        setHosts((prev) => [...prev, body]);
      } else {
        await fetchHosts();
      }
      setNewHostName("");
      setNewHostUrl("");
      toast.success(`Host ${name} added`);
    } catch (err) {
      console.error("Error adding host:", err);
      setAddHostError(err instanceof Error ? err.message : "Could not add the host.");
      toast.error(`Could not add host ${name}`);
    } finally {
      setAddingHost(false);
    }
  };

  const handleRemoveHost = async (host) => {
    if (!host?.id || host.name === "local") return;
    setRemovingHostId(host.id);
    setAddHostError(null);
    try {
      const response = await fetch(
        `${CONTAINERS_API}/hosts/${encodeURIComponent(host.id)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`);
      }
      setHosts((prev) => prev.filter((h) => h.id !== host.id));
      setSelectedHost((prev) => (prev === host.name ? "local" : prev));
      toast.success(`Host ${host.name} removed`);
    } catch (err) {
      console.error("Error removing host:", err);
      setAddHostError(`Could not remove host ${host.name}. Please try again.`);
      toast.error(`Could not remove host ${host.name}`);
    } finally {
      setRemovingHostId(null);
    }
  };

  const openHostsModal = () => {
    setAddHostError(null);
    setNewHostName("");
    setNewHostUrl("");
    setHostsModal(true);
    fetchHosts();
  };

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch(`${AUTH_API}/userData`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Auth service responded with ${response.status}`);
      }
      // The endpoint returns a JSON-encoded string, so it may need a second parse
      const raw = await response.json();
      const user = typeof raw === "string" ? JSON.parse(raw) : raw;
      const owner =
        user?.email || (user?._id && user._id.$oid) || "local";
      setCurrentUserId(owner);
    } catch (err) {
      console.error("Could not load user data, falling back to local owner:", err);
      setCurrentUserId("local");
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${ROOMS_API}/rooms`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Rooms service responded with ${response.status}`);
      }
      const data = await response.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching rooms:", err);
      setError("Could not load workspaces. Make sure the rooms service is running on port 5002.");
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    fetchRooms();
  }, [fetchCurrentUser, fetchRooms]);

  const openCreateModal = () => {
    setSelectedHost("local");
    setActionError(null);
    setOpenModal(true);
    fetchHosts();
  };

  const handleCreateRoom = async () => {
    setCreating(true);
    setActionError(null);
    try {
      const body = {
        name: roomName.trim(),
        is_private: isPrivate === "private",
        password: isPrivate === "private" ? password : "",
        owner: currentUserId || "local",
        host: selectedHost || "local"
      };
      const response = await fetch(`${ROOMS_API}/rooms`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Create failed with status ${response.status}`);
      }
      const created = await response.json();
      // If the API doesn't echo the room back, refetch; otherwise append immutably
      if (created && created._id) {
        setRooms((prev) => [...prev, created]);
      } else {
        await fetchRooms();
      }
      setOpenModal(false);
      setRoomName("");
      setPassword("");
      setIsPrivate("public");
      setSelectedHost("local");
      toast.success(`Workspace "${body.name}" created`);
    } catch (err) {
      console.error("Error creating workspace:", err);
      setActionError("Could not create the workspace. Please try again.");
      toast.error("Could not create the workspace");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRoom = async (roomId, patch) => {
    setActionError(null);
    try {
      const existing = rooms.find((r) => r._id === roomId);
      if (!existing) return;
      const body = {
        name: existing.name,
        owner: existing.owner,
        is_private: existing.is_private,
        password: existing.password || "",
        ...patch
      };
      const response = await fetch(`${ROOMS_API}/rooms/${roomId}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Update failed with status ${response.status}`);
      }
      setRooms((prev) =>
        prev.map((r) => (r._id === roomId ? { ...r, ...patch } : r))
      );
    } catch (err) {
      console.error("Error updating workspace:", err);
      setActionError("Could not update the workspace. Please try again.");
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm("Delete this workspace? This cannot be undone.")) {
      return;
    }
    setActionError(null);
    try {
      const response = await fetch(`${ROOMS_API}/rooms/${roomId}`, {
        method: "DELETE",
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`);
      }
      setRooms((prev) => prev.filter((r) => r._id !== roomId));
      toast.success("Workspace deleted");
    } catch (err) {
      console.error("Error deleting workspace:", err);
      setActionError("Could not delete the workspace. Please try again.");
      toast.error("Could not delete the workspace");
    }
  };

  const handleJoinRoom = (room) => {
    if (!room.is_private) {
      history.push(`/room/${room._id}`);
    } else {
      setJoinRoom(room);
      setJoinError(null);
      setPasswordModal(true);
    }
  };

  const handlePasswordSubmit = () => {
    // Local tool: passwords are stored in plaintext, validated client-side
    if (joinRoom && (joinRoom.password || "") === joinPassword) {
      setPasswordModal(false);
      setJoinPassword("");
      setJoinError(null);
      history.push(`/room/${joinRoom._id}`);
    } else {
      setJoinError("Incorrect password. Please try again.");
    }
  };

  const filteredRooms = rooms.filter((room) =>
    (room.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const publicRooms = filteredRooms.filter((room) => !room.is_private);
  const privateRooms = filteredRooms.filter((room) => room.is_private);

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Workspaces</h1>
            <p className="text-gray-600">Collaborate with your team in shared environments</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={openHostsModal}
              title="Manage Docker hosts"
              className="flex items-center space-x-2 px-4 py-3 text-gray-500 hover:text-gray-900 hover:bg-white rounded-full border border-gray-200 transition-all duration-200 text-sm font-medium"
            >
              <Server className="w-4 h-4" />
              <span>Hosts</span>
            </button>
            <button
              onClick={openCreateModal}
              className="group flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workspace</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-8">
          {/* Hidden decoys: Chrome ignores autoComplete="off" and shoves saved
              credentials into nearby text inputs; these absorb the autofill. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute w-0 h-0 opacity-0 pointer-events-none"
            readOnly
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute w-0 h-0 opacity-0 pointer-events-none"
            readOnly
          />
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              name="workspace-filter"
              autoComplete="off"
              placeholder="Search workspaces..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              readOnly={searchReadOnly}
              onFocus={() => setSearchReadOnly(false)}
              onBlur={() => setSearchReadOnly(true)}
              className="pl-10 pr-4 py-3 w-full border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
            />
          </div>
        </div>

        {/* Action error banner */}
        {actionError && (
          <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100 mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-auto text-red-400 hover:text-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Something went wrong</h3>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={fetchRooms}
              className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Public Workspaces */}
            {publicRooms.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Globe className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-medium text-gray-900">Public Workspaces</h2>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {publicRooms.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publicRooms.map((room) => (
                    <WorkspaceCard
                      key={room._id}
                      room={room}
                      currentUserId={currentUserId}
                      onJoin={handleJoinRoom}
                      onUpdate={handleUpdateRoom}
                      onDelete={handleDeleteRoom}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Private Workspaces */}
            {privateRooms.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Lock className="w-5 h-5 text-orange-600" />
                  <h2 className="text-xl font-medium text-gray-900">Private Workspaces</h2>
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                    {privateRooms.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {privateRooms.map((room) => (
                    <WorkspaceCard
                      key={room._id}
                      room={room}
                      currentUserId={currentUserId}
                      onJoin={handleJoinRoom}
                      onUpdate={handleUpdateRoom}
                      onDelete={handleDeleteRoom}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredRooms.length === 0 && (
              <div className="text-center py-20">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? "No workspaces found" : "No workspaces yet"}
                </h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm
                    ? "Try adjusting your search criteria"
                    : "Create your first workspace to start collaborating"}
                </p>
                {!searchTerm && (
                  <button
                    onClick={openCreateModal}
                    className="px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium"
                  >
                    Create Workspace
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setOpenModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-gray-900">Create Workspace</h2>
              <button
                onClick={() => setOpenModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="workspaceName" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Name
                </label>
                <input
                  id="workspaceName"
                  type="text"
                  autoComplete="off"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                  placeholder="My Awesome Workspace"
                />
              </div>

              <div>
                <label htmlFor="privacy" className="block text-sm font-medium text-gray-700 mb-2">
                  Privacy
                </label>
                <select
                  id="privacy"
                  value={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                >
                  <option value="public">Public - Anyone can join</option>
                  <option value="private">Private - Password required</option>
                </select>
              </div>

              <div>
                <label htmlFor="workspaceHost" className="block text-sm font-medium text-gray-700 mb-2">
                  Host
                </label>
                {hostsLoading ? (
                  <div className="flex items-center space-x-2 text-gray-400 text-sm py-3">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Loading hosts...</span>
                  </div>
                ) : (
                  <select
                    id="workspaceHost"
                    value={selectedHost}
                    onChange={(e) => setSelectedHost(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                  >
                    {hosts.map((h) => (
                      <option key={h.id || h.name} value={h.name}>
                        {h.name}
                        {String(h.status || "").toLowerCase() === "down" ? " (down)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Where this workspace&apos;s containers will run. Manage hosts from
                  the Hosts button.
                </p>
              </div>

              {isPrivate === "private" && (
                <div>
                  <label htmlFor="workspacePassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="workspacePassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                      placeholder="Enter workspace password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleCreateRoom}
                  disabled={!roomName.trim() || (isPrivate === "private" && !password.trim()) || creating}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    "Create Workspace"
                  )}
                </button>
                <button
                  onClick={() => setOpenModal(false)}
                  className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Private Workspace Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setPasswordModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-gray-900">Enter Password</h2>
              <button
                onClick={() => setPasswordModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="joinPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Password
                </label>
                <div className="relative">
                  <input
                    id="joinPassword"
                    type={showJoinPassword ? "text" : "password"}
                    value={joinPassword}
                    onChange={(e) => {
                      setJoinPassword(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && joinPassword.trim()) {
                        handlePasswordSubmit();
                      }
                    }}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                    placeholder="Enter password to join"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJoinPassword(!showJoinPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showJoinPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {joinError && (
                <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{joinError}</span>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handlePasswordSubmit}
                  disabled={!joinPassword.trim()}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Workspace
                </button>
                <button
                  onClick={() => {
                    setPasswordModal(false);
                    setJoinPassword("");
                    setJoinError(null);
                  }}
                  className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hosts Management Modal */}
      {hostsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => !addingHost && setHostsModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl shadow-xl max-w-lg w-full p-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <Server className="w-5 h-5 text-gray-500" />
                <h2 className="text-xl font-medium text-gray-900">Docker Hosts</h2>
              </div>
              <button
                onClick={() => setHostsModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {hostsError && (
                <div className="flex items-center space-x-2 text-orange-600 text-sm bg-orange-50 px-4 py-3 rounded-xl border border-orange-100">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{hostsError}</span>
                  <button
                    onClick={fetchHosts}
                    title="Retry"
                    className="ml-auto text-orange-500 hover:text-orange-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              )}

              {hostsLoading ? (
                <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm py-6">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Loading hosts...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {hosts.map((h) => {
                    const isLocalHost = h.name === "local" || !h.url;
                    return (
                      <div
                        key={h.id || h.name}
                        className="flex items-center justify-between px-4 py-3 border border-gray-100 rounded-xl"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <HostStatusDot status={h.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {h.name}
                            </p>
                            <p className="text-xs text-gray-400 font-mono truncate">
                              {h.url || "local daemon"}
                            </p>
                          </div>
                        </div>
                        {!isLocalHost && (
                          <button
                            onClick={() => handleRemoveHost(h)}
                            disabled={removingHostId === h.id}
                            title={`Remove ${h.name}`}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-50 flex-shrink-0"
                          >
                            {removingHostId === h.id ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add host form */}
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-700">Add a host</p>
                <input
                  type="text"
                  autoComplete="off"
                  value={newHostName}
                  onChange={(e) => setNewHostName(e.target.value)}
                  disabled={addingHost}
                  placeholder="Name, e.g. vps-1"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 disabled:opacity-50"
                />
                <input
                  type="text"
                  autoComplete="off"
                  value={newHostUrl}
                  onChange={(e) => setNewHostUrl(e.target.value)}
                  disabled={addingHost}
                  placeholder="tcp://host:2375"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 font-mono text-sm disabled:opacity-50"
                />
                <p className="text-xs text-gray-400">
                  The remote Docker daemon must expose its API at this address
                  (e.g. <span className="font-mono">dockerd -H tcp://0.0.0.0:2375</span>).
                  Connectivity is verified when you add it.
                </p>

                {addHostError && (
                  <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="break-words">{addHostError}</span>
                  </div>
                )}

                <button
                  onClick={handleAddHost}
                  disabled={addingHost || !newHostName.trim() || !newHostUrl.trim()}
                  className="w-full px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {addingHost ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Host
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
