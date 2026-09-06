import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Cli } from './Cli';
import { Graph } from './Graph';
import {
  Server,
  Plus,
  Loader,
  Activity,
  Network,
  Terminal,
  X,
  RefreshCw,
  AlertCircle,
  Cpu,
  MemoryStick,
  ArrowDownUp,
  HardDrive,
  Hash,
  Package,
  Play,
  Container,
  CornerDownRight,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip
} from 'chart.js';
import { authHeaders, redirectIfUnauthorized } from '../lib/api';
import { toast } from '../lib/toast';
import {
  publishWorkspaceInfo,
  clearWorkspaceInfo,
  onWorkspaceAction
} from '../lib/workspaceBridge';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  ChartTooltip
);

const ROOMS_API = 'http://localhost:5002';
const CONTAINERS_API = 'http://localhost:5001';
const PACKAGES_API = 'http://localhost:5003';

const NODE_PREFIX = 'lat';
const ROOM_ID_SLICE = 8;

/** Workspace parent container name: exactly `lat-<first 8 chars of room id>`. */
const roomParentName = (roomId) =>
  `${NODE_PREFIX}-${String(roomId || '').slice(0, ROOM_ID_SLICE)}`;

/** Sanitize a user-chosen node name: lowercase, [a-z0-9-] only. */
const sanitizeNodeName = (raw) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

const DEFAULT_CHILD_IMAGE = 'docker:dind';
const DEFAULT_CHILD_SHELL = 'sh';

/** Docker Names can be an array and may carry a leading '/'. */
const rawName = (names) => {
  const first = Array.isArray(names) ? names[0] : names;
  return String(first || '').replace(/^\//, '');
};

const isRunning = (status) => {
  const s = String(status || '').toLowerCase();
  return s.startsWith('running') || s.startsWith('up');
};

const MetricCard = ({ icon: Icon, label, value, sub }) => (
  <div className="bg-white/70 rounded-2xl p-4 border border-gray-100">
    <div className="flex items-center space-x-2 mb-2">
      <Icon className="w-4 h-4 text-gray-500" />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </span>
    </div>
    <p className="text-xl font-light text-gray-900 truncate">{value || '—'}</p>
    {sub ? <p className="text-xs text-gray-400 font-mono truncate mt-1">{sub}</p> : null}
  </div>
);

const SPARKLINE_HEIGHT = 60;

const SPARKLINE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: { mode: 'index', intersect: false, displayColors: false }
  },
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { display: false },
    y: { display: false }
  },
  elements: { point: { radius: 0, hitRadius: 8 } }
};

const Sparkline = ({ label, labels, values, color, fillColor }) => (
  <div className="bg-white/70 rounded-2xl p-3 border border-gray-100">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
      {label}
    </p>
    <div style={{ height: SPARKLINE_HEIGHT }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              data: values,
              borderColor: color,
              backgroundColor: fillColor,
              borderWidth: 1.5,
              tension: 0.3,
              fill: true
            }
          ]
        }}
        options={SPARKLINE_OPTIONS}
      />
    </div>
  </div>
);

/** Full-width card used for the provisioning / stopped / error lifecycle states. */
const LifecycleCard = ({ children }) => (
  <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-12">
    <div className="flex flex-col items-center justify-center text-center space-y-4">
      {children}
    </div>
  </div>
);

export const Room = () => {
  const { id } = useParams();
  const parentName = roomParentName(id);

  const [room, setRoom] = useState(null);
  const [roomError, setRoomError] = useState(null);
  const [roomLoading, setRoomLoading] = useState(true);

  const [parent, setParent] = useState(null);
  const [parentChecked, setParentChecked] = useState(false);
  const [containersLoading, setContainersLoading] = useState(true);
  const [containersError, setContainersError] = useState(null);

  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState(null);
  const provisionAttemptedRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  const [children, setChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [grandchildrenByChild, setGrandchildrenByChild] = useState({});

  const [metrics, setMetrics] = useState({ loading: false, error: null, data: null });
  const metricsRequestRef = useRef(0);

  const [history, setHistory] = useState({ loading: false, samples: [] });
  const historyRequestRef = useRef(0);

  const [openModalGraph, setOpenModalGraph] = useState(false);
  const [openModalInstall, setOpenModalInstall] = useState(false);
  const [openModalCreate, setOpenModalCreate] = useState(false);

  const [childName, setChildName] = useState('');
  const [childImage, setChildImage] = useState(DEFAULT_CHILD_IMAGE);
  const [childShell, setChildShell] = useState(DEFAULT_CHILD_SHELL);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState(null);

  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState(null);

  const parentId = parent?.ID || null;
  const parentRunning = Boolean(parent && isRunning(parent.Status));

  // Multi-host: rooms may carry a `host` field naming a remote Docker daemon.
  // Absent or "local" means the local daemon (no query param).
  const roomHost = room?.host && room.host !== 'local' ? room.host : null;

  /** Append ?host=<name> to a containers-service URL when this room is remote. */
  const withHost = useCallback(
    (url) => {
      if (!roomHost) return url;
      const parsed = new URL(url);
      parsed.searchParams.set('host', roomHost);
      return parsed.toString();
    },
    [roomHost]
  );

  const fetchRoom = useCallback(async () => {
    setRoomLoading(true);
    setRoomError(null);
    try {
      const response = await fetch(`${ROOMS_API}/rooms/${id}`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Rooms service responded with ${response.status}`);
      }
      const raw = await response.json();
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      setRoom(data && typeof data === 'object' ? data : null);
    } catch (err) {
      console.error('Error fetching workspace:', err);
      setRoomError('Could not load this workspace.');
    } finally {
      setRoomLoading(false);
    }
  }, [id]);

  /** Locate the single workspace parent container by exact name match. */
  const fetchParent = useCallback(async () => {
    setContainersLoading(true);
    setContainersError(null);
    try {
      const response = await fetch(withHost(`${CONTAINERS_API}/containers`), {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return null;
      if (!response.ok) {
        throw new Error(`Containers service responded with ${response.status}`);
      }
      const data = await response.json();
      const all = Array.isArray(data) ? data : [];
      const found = all.find((c) => rawName(c.Names) === parentName) || null;
      setParent(found);
      setParentChecked(true);
      return found;
    } catch (err) {
      console.error('Error fetching containers:', err);
      setContainersError(
        'Could not reach the containers service. Make sure it is running on port 5001.'
      );
      setParent(null);
      return null;
    } finally {
      setContainersLoading(false);
    }
  }, [parentName, withHost]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  /* Look up the parent only after the room fetch settles, so the lookup
     targets the room's host (remote daemons keep their own container list). */
  useEffect(() => {
    if (!roomLoading) {
      fetchParent();
    }
  }, [roomLoading, fetchParent]);

  /** Create the Docker-in-Docker parent for this workspace. */
  const provisionParent = useCallback(async () => {
    provisionAttemptedRef.current = true;
    setProvisioning(true);
    setProvisionError(null);
    try {
      const response = await fetch(
        withHost(`${CONTAINERS_API}/containermain/${encodeURIComponent(parentName)}`),
        { method: 'POST', headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Provisioning responded with ${response.status}`);
      }
      await response.json();
      const found = await fetchParent();
      if (!found) {
        setProvisionError(
          'The workspace container did not appear after setup. Retry to try again.'
        );
      } else {
        toast.success('Workspace container ready');
      }
    } catch (err) {
      console.error('Error provisioning workspace container:', err);
      setProvisionError(
        'Could not set up the workspace container. Check that the containers service is running, then retry.'
      );
    } finally {
      setProvisioning(false);
    }
  }, [parentName, fetchParent, withHost]);

  /* Auto-provision exactly once when the room is loaded and no parent exists. */
  useEffect(() => {
    if (
      room &&
      parentChecked &&
      !containersLoading &&
      !containersError &&
      !parent &&
      !provisionAttemptedRef.current
    ) {
      provisionParent();
    }
  }, [room, parentChecked, containersLoading, containersError, parent, provisionParent]);

  const startParent = async () => {
    if (!parentId) return;
    setStarting(true);
    setStartError(null);
    try {
      const response = await fetch(
        withHost(`${CONTAINERS_API}/container/${parentId}/start`),
        { method: 'POST', headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      let body = null;
      try {
        body = await response.json();
      } catch (parseErr) {
        console.error('Could not parse start response:', parseErr);
      }
      if (!response.ok) {
        throw new Error(String(body?.detail || `Start failed with status ${response.status}`));
      }
      await fetchParent();
    } catch (err) {
      console.error('Error starting workspace container:', err);
      setStartError('Could not start the workspace container. Try again.');
    } finally {
      setStarting(false);
    }
  };

  const fetchChildren = useCallback(async (nodeId) => {
    setChildrenLoading(true);
    setChildrenError(null);
    try {
      const response = await fetch(
        withHost(`${CONTAINERS_API}/containers/${nodeId}/ps`),
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return [];
      if (!response.ok) {
        throw new Error(`ps request responded with ${response.status}`);
      }
      const data = await response.json();
      const items = Array.isArray(data?.output) ? data.output : [];
      setChildren(items);
      const validIds = new Set(items.map((c) => c.ID));
      setSelectedChild((prev) => (prev && !validIds.has(prev.ID) ? null : prev));
      setGrandchildrenByChild((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => validIds.has(key)))
      );
      return items;
    } catch (err) {
      console.error('Error fetching containers inside the workspace:', err);
      setChildrenError('Could not list the containers inside this workspace.');
      setChildren([]);
      return [];
    } finally {
      setChildrenLoading(false);
    }
  }, [withHost]);

  useEffect(() => {
    if (parentId && parentRunning) {
      fetchChildren(parentId);
    } else {
      setChildren([]);
      setSelectedChild(null);
    }
  }, [parentId, parentRunning, fetchChildren]);

  /**
   * Probe a child for its own children (grandchildren). Children only have
   * them if they run Docker themselves, so any failure means "none".
   */
  const probeGrandchildren = useCallback(async (nodeId, childId) => {
    setGrandchildrenByChild((prev) => ({
      ...prev,
      [childId]: { loading: true, items: prev[childId]?.items || [] }
    }));
    try {
      const command = `docker exec ${childId} docker ps --format "{{.ID}},{{.Names}},{{.Image}},{{.Status}}"`;
      const response = await fetch(
        withHost(`${CONTAINERS_API}/exe/${nodeId}/${encodeURIComponent(command)}`),
        { method: 'POST', headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`exe request responded with ${response.status}`);
      }
      const body = await response.json();
      if (body?.error) {
        throw new Error(String(body.error));
      }
      const items = String(body?.output || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(',');
          return {
            ID: parts[0] || '',
            Name: parts[1] || '',
            Image: parts[2] || '',
            Status: parts.slice(3).join(',')
          };
        })
        .filter((g) => g.ID);
      setGrandchildrenByChild((prev) => ({
        ...prev,
        [childId]: { loading: false, items }
      }));
    } catch (err) {
      /* Expected when the child has no Docker inside — render as no grandchildren. */
      setGrandchildrenByChild((prev) => ({
        ...prev,
        [childId]: { loading: false, items: [] }
      }));
    }
  }, [withHost]);

  const handleSelectChild = (child) => {
    const deselecting = selectedChild?.ID === child.ID;
    setSelectedChild(deselecting ? null : child);
    if (!deselecting && parentId && !grandchildrenByChild[child.ID]) {
      probeGrandchildren(parentId, child.ID);
    }
  };

  const loadMetrics = useCallback(async (nodeId, child) => {
    if (!nodeId) return;
    const token = metricsRequestRef.current + 1;
    metricsRequestRef.current = token;
    setMetrics({ loading: true, error: null, data: null });
    try {
      let data = null;
      if (child?.ID) {
        const command = `docker stats ${child.ID} --no-stream --format "{{json .}}"`;
        const response = await fetch(
          withHost(`${CONTAINERS_API}/exe/${nodeId}/${encodeURIComponent(command)}`),
          { method: 'POST', headers: { ...authHeaders() } }
        );
        if (redirectIfUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error(`exe request responded with ${response.status}`);
        }
        const body = await response.json();
        if (body?.error) {
          throw new Error(String(body.error));
        }
        try {
          const firstLine = String(body?.output || '')
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith('{'));
          data = firstLine ? JSON.parse(firstLine) : {};
        } catch (parseErr) {
          console.error('Could not parse child metrics output:', parseErr);
          data = {};
        }
      } else {
        const response = await fetch(
          withHost(`${CONTAINERS_API}/container/${nodeId}/metrics`),
          { headers: { ...authHeaders() } }
        );
        if (redirectIfUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error(`metrics request responded with ${response.status}`);
        }
        data = await response.json();
      }
      if (metricsRequestRef.current === token) {
        setMetrics({ loading: false, error: null, data: data || {} });
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
      if (metricsRequestRef.current === token) {
        setMetrics({
          loading: false,
          error: 'Could not load metrics for this target.',
          data: null
        });
      }
    }
  }, [withHost]);

  useEffect(() => {
    if (parentId && parentRunning) {
      loadMetrics(parentId, selectedChild);
    } else {
      setMetrics({ loading: false, error: null, data: null });
    }
  }, [parentId, parentRunning, selectedChild, loadMetrics]);

  /**
   * Metrics history for the sparklines. Sampled per host container, so it is
   * only fetched for the parent (never for a selected child). Any failure —
   * endpoint not deployed yet, network error, bad payload — hides the charts.
   */
  const loadHistory = useCallback(
    async (nodeId) => {
      const token = historyRequestRef.current + 1;
      historyRequestRef.current = token;
      setHistory({ loading: true, samples: [] });
      try {
        const response = await fetch(
          withHost(`${CONTAINERS_API}/containers/${nodeId}/metrics/history?minutes=60`),
          { headers: { ...authHeaders() } }
        );
        if (redirectIfUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error(`history request responded with ${response.status}`);
        }
        const body = await response.json();
        const samples = (Array.isArray(body?.samples) ? body.samples : [])
          .map((s) => ({
            ts: s?.ts,
            cpu: Number(s?.cpu),
            mem: Number(s?.mem)
          }))
          .filter((s) => Number.isFinite(s.cpu) && Number.isFinite(s.mem));
        if (historyRequestRef.current === token) {
          setHistory({ loading: false, samples });
        }
      } catch (err) {
        // Graceful degradation: the endpoint may not exist yet.
        console.error('Metrics history unavailable:', err);
        if (historyRequestRef.current === token) {
          setHistory({ loading: false, samples: [] });
        }
      }
    },
    [withHost]
  );

  useEffect(() => {
    if (parentId && parentRunning && !selectedChild) {
      loadHistory(parentId);
    } else {
      setHistory({ loading: false, samples: [] });
    }
  }, [parentId, parentRunning, selectedChild, loadHistory]);

  const openCreateModal = () => {
    setChildName('');
    setCreationError(null);
    setOpenModalCreate(true);
  };

  /** Create a child container inside the workspace parent (legacy GET endpoint). */
  const createChild = async () => {
    if (!parentId) return;
    const cleanedName = sanitizeNodeName(childName);
    if (!cleanedName) {
      setCreationError('A node name is required (letters, numbers and dashes).');
      return;
    }
    const image = childImage.trim() || DEFAULT_CHILD_IMAGE;
    const shell = childShell.trim() || DEFAULT_CHILD_SHELL;

    setCreating(true);
    setCreationError(null);
    try {
      const response = await fetch(
        withHost(
          `${CONTAINERS_API}/container/${encodeURIComponent(parentId)}/${encodeURIComponent(
            cleanedName
          )}/${encodeURIComponent(image)}/${encodeURIComponent(shell)}`
        ),
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Node creation responded with ${response.status}`);
      }
      const body = await response.json();
      const output = String(body?.output || '').trim();

      // Docker's output is noisy (image pull progress mentions the image name,
      // "Unable to find image ... locally" is not an error, etc). The only
      // reliable success check is whether the container actually exists now.
      const items = await fetchChildren(parentId);
      const created = items.some((c) => c.Name === cleanedName);
      if (!created) {
        const lastLine = output.split('\n').filter(Boolean).pop() || '';
        const message = lastLine || 'Docker rejected the container.';
        setCreationError(message);
        toast.error(`Could not create node ${cleanedName}: ${message}`);
        return;
      }
      setOpenModalCreate(false);
      setChildName('');
      toast.success(`Node ${cleanedName} created`);
    } catch (err) {
      console.error('Error creating node inside the workspace:', err);
      setCreationError(
        'Failed to create the node. Check that the containers service is running.'
      );
      toast.error(`Could not create node ${cleanedName}`);
    } finally {
      setCreating(false);
    }
  };

  const fetchPackages = useCallback(async () => {
    setPackagesLoading(true);
    setPackagesError(null);
    try {
      const response = await fetch(`${PACKAGES_API}/packages`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Packages service responded with ${response.status}`);
      }
      const data = await response.json();
      setPackages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching packages:', err);
      setPackagesError(
        'Could not load plugins. Make sure the packages service is running on port 5003.'
      );
      setPackages([]);
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  const openInstallModal = () => {
    setInstallResult(null);
    setSelectedPackageId('');
    setOpenModalInstall(true);
    fetchPackages();
  };

  const installPlugin = async () => {
    if (!parentId || !selectedPackageId) return;

    setInstalling(true);
    setInstallResult(null);
    const url = selectedChild?.ID
      ? `${CONTAINERS_API}/node/${parentId}/${selectedChild.ID}/install/${selectedPackageId}`
      : `${CONTAINERS_API}/container/${parentId}/install/${selectedPackageId}`;

    const pkg = packages.find((p) => p._id === selectedPackageId);
    const pluginLabel = pkg?.name || 'plugin';
    const installTarget = selectedChild
      ? selectedChild.Name || selectedChild.ID
      : parentName;

    try {
      const response = await fetch(withHost(url), {
        method: 'POST',
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      let body = null;
      try {
        body = await response.json();
      } catch (parseErr) {
        console.error('Could not parse install response:', parseErr);
      }
      if (!response.ok) {
        const detail =
          body?.detail || body?.error || `Install failed with status ${response.status}.`;
        setInstallResult({ ok: false, message: String(detail) });
        toast.error(String(detail));
        return;
      }
      setInstallResult({
        ok: true,
        path: body?.path,
        files: Array.isArray(body?.files) ? body.files : [],
        installOutput: body?.installOutput
      });
      toast.success(`Plugin ${pluginLabel} installed in ${installTarget}`);
    } catch (err) {
      console.error('Error installing plugin:', err);
      setInstallResult({
        ok: false,
        message: 'Could not reach the install service.'
      });
      toast.error(`Could not install ${pluginLabel}: install service unreachable`);
    } finally {
      setInstalling(false);
    }
  };

  const roomLabel = room?.name || parentName;
  const selectedTargetLabel = selectedChild
    ? selectedChild.Name || selectedChild.ID
    : parent
    ? parentName
    : 'None';

  /* Publish the workspace snapshot for the right sidebar whenever it changes. */
  useEffect(() => {
    publishWorkspaceInfo({
      name: roomLabel,
      status: parent ? parent.Status : provisioning ? 'provisioning' : 'missing',
      running: parentRunning,
      parentName,
      host: room?.host,
      childrenCount: children.length,
      selectedLabel: selectedTargetLabel,
      owner: room?.owner
    });
  }, [
    roomLabel,
    parent,
    provisioning,
    parentRunning,
    parentName,
    room,
    children.length,
    selectedTargetLabel
  ]);

  /* Clear the sidebar snapshot when leaving the page. */
  useEffect(() => () => clearWorkspaceInfo(), []);

  /* React to actions triggered from the sidebar's Workspace card. */
  useEffect(() => {
    const unsubscribe = onWorkspaceAction((action) => {
      if (action === 'network') {
        setOpenModalGraph(true);
      }
      if (action === 'create-node' && parentRunning) {
        setChildName('');
        setCreationError(null);
        setOpenModalCreate(true);
      }
    });
    return unsubscribe;
  }, [parentRunning]);

  if (roomLoading && containersLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  const memData = metrics.data || {};

  /* ---- Lifecycle card (shown instead of the main grid until the parent runs) ---- */
  let lifecycleCard = null;
  if (provisioning || (!parent && room && parentChecked && !containersError && !provisionError)) {
    lifecycleCard = (
      <LifecycleCard>
        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
          <Loader className="w-7 h-7 text-white animate-spin" />
        </div>
        <p className="text-lg font-medium text-gray-900">
          Setting up workspace container… this takes ~20 seconds.
        </p>
        <p className="text-sm text-gray-500 font-mono">
          {parentName} · docker:dind
        </p>
      </LifecycleCard>
    );
  } else if (provisionError) {
    lifecycleCard = (
      <LifecycleCard>
        <AlertCircle className="w-10 h-10 text-red-300" />
        <p className="text-lg font-medium text-gray-900">Workspace setup failed</p>
        <p className="text-sm text-gray-500 max-w-md">{provisionError}</p>
        <button
          onClick={provisionParent}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all duration-200 font-medium shadow-md"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </LifecycleCard>
    );
  } else if (containersError) {
    lifecycleCard = (
      <LifecycleCard>
        <AlertCircle className="w-10 h-10 text-red-300" />
        <p className="text-lg font-medium text-gray-900">Containers service unreachable</p>
        <p className="text-sm text-gray-500 max-w-md">{containersError}</p>
        <button
          onClick={fetchParent}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all duration-200 font-medium shadow-md"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </LifecycleCard>
    );
  } else if (containersLoading && !parent) {
    lifecycleCard = (
      <LifecycleCard>
        <div className="w-10 h-10 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
        <p className="text-sm text-gray-500">Checking workspace container…</p>
      </LifecycleCard>
    );
  } else if (parent && !parentRunning) {
    lifecycleCard = (
      <LifecycleCard>
        <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center">
          <Server className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-lg font-medium text-gray-900">Workspace container is stopped</p>
        <p className="text-sm text-gray-500 font-mono">{parentName}</p>
        {startError && (
          <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{startError}</span>
          </div>
        )}
        <button
          onClick={startParent}
          disabled={starting}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all duration-200 font-medium shadow-md disabled:opacity-50"
        >
          {starting ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span>{starting ? 'Starting…' : 'Start'}</span>
        </button>
      </LifecycleCard>
    );
  } else if (!room && roomError) {
    lifecycleCard = (
      <LifecycleCard>
        <AlertCircle className="w-10 h-10 text-red-300" />
        <p className="text-lg font-medium text-gray-900">Workspace unavailable</p>
        <p className="text-sm text-gray-500 max-w-md">{roomError}</p>
      </LifecycleCard>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Slim breadcrumb: workspace details now live in the right sidebar */}
        <div className="mb-6">
          <Link
            to="/nodesly"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Workspaces
          </Link>
        </div>

        {roomError && (
          <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100 mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{roomError}</span>
            <button
              onClick={fetchRoom}
              className="ml-auto flex items-center space-x-1 text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {lifecycleCard ? (
          lifecycleCard
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Containers Panel (children of the workspace parent) */}
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-8 xl:col-span-1">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
                    <Container className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Containers</h2>
                </div>
                <button
                  onClick={() => parentId && fetchChildren(parentId)}
                  disabled={childrenLoading}
                  title="Refresh containers"
                  className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${childrenLoading ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>

              {childrenLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
                </div>
              ) : childrenError ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
                  <p className="text-gray-600 text-sm mb-4">{childrenError}</p>
                  <button
                    onClick={() => parentId && fetchChildren(parentId)}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Try Again</span>
                  </button>
                </div>
              ) : children.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Container className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-900 font-medium mb-1">
                    No containers inside yet
                  </p>
                  <p className="text-gray-500 text-sm mb-4">
                    Create your first node inside this workspace.
                  </p>
                  <button
                    onClick={openCreateModal}
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all duration-200 font-medium shadow-md mb-4"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Node</span>
                  </button>
                  <p className="text-gray-400 text-xs mb-2">
                    or from the terminal below:
                  </p>
                  <code className="inline-block bg-gray-900 text-gray-100 text-xs font-mono px-4 py-2 rounded-xl">
                    docker run -d --name web nginx:alpine
                  </code>
                </div>
              ) : (
                <div className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
                  {children.map((child) => {
                    const childSelected = selectedChild?.ID === child.ID;
                    const grandState = grandchildrenByChild[child.ID];
                    return (
                      <div key={child.ID}>
                        <button
                          onClick={() => handleSelectChild(child)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                            childSelected
                              ? 'border-black bg-gray-50 shadow-sm'
                              : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center space-x-1 font-medium text-gray-900 truncate">
                              {childSelected ? (
                                <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />
                              )}
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isRunning(child.Status) ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                              ></span>
                              <span className="truncate">{child.Name || child.ID}</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-gray-400 font-mono">
                            <span className="truncate">{child.Image}</span>
                            <span>{child.IP || 'no IP'}</span>
                          </div>
                        </button>

                        {/* Grandchildren: containers created from this node's terminal */}
                        {childSelected && (
                          <div className="ml-5 mt-2 pl-3 border-l-2 border-gray-100 space-y-2">
                            {grandState?.loading ? (
                              <div className="flex items-center space-x-2 text-gray-400 text-sm py-2">
                                <Loader className="w-4 h-4 animate-spin" />
                                <span>Checking for nested containers...</span>
                              </div>
                            ) : (grandState?.items || []).length > 0 ? (
                              <>
                                <p className="text-xs text-gray-400 pt-1">
                                  created from this node&apos;s terminal
                                </p>
                                {grandState.items.map((grand) => (
                                  <div
                                    key={grand.ID}
                                    className="px-3 py-2 rounded-xl border border-gray-100 text-sm"
                                  >
                                    <div className="flex items-center space-x-2 truncate">
                                      <CornerDownRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />
                                      <span
                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                          isRunning(grand.Status)
                                            ? 'bg-green-500'
                                            : 'bg-gray-300'
                                        }`}
                                      ></span>
                                      <span className="font-medium text-gray-800 truncate">
                                        {grand.Name || grand.ID}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-400 font-mono truncate mt-1 pl-5">
                                      {grand.Image}
                                    </p>
                                  </div>
                                ))}
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right column: metrics + terminal */}
            <div className="xl:col-span-2 space-y-6">
              {/* Metrics Panel */}
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">Metrics</span>
                    <span className="text-sm text-gray-400 font-mono truncate">
                      · {selectedTargetLabel}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={openInstallModal}
                      className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all duration-200 text-sm font-medium border border-gray-200/70"
                    >
                      <Package className="w-4 h-4" />
                      <span>Install Plugin</span>
                    </button>
                    <button
                      onClick={() => {
                        loadMetrics(parentId, selectedChild);
                        if (parentId && !selectedChild) loadHistory(parentId);
                      }}
                      disabled={metrics.loading}
                      title="Refresh metrics"
                      className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${metrics.loading ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {metrics.loading ? (
                  <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm py-8">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Collecting stats... this takes a couple of seconds.</span>
                  </div>
                ) : metrics.error ? (
                  <div className="flex items-center justify-center space-x-2 text-sm text-red-500 py-6">
                    <AlertCircle className="w-4 h-4" />
                    <span>{metrics.error}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <MetricCard icon={Cpu} label="CPU" value={memData.CPUPerc} />
                    <MetricCard
                      icon={MemoryStick}
                      label="Memory"
                      value={memData.MemPerc}
                      sub={memData.MemUsage}
                    />
                    <MetricCard
                      icon={ArrowDownUp}
                      label="Net I/O"
                      value={memData.NetIO}
                    />
                    <MetricCard
                      icon={HardDrive}
                      label="Block I/O"
                      value={memData.BlockIO}
                    />
                    <MetricCard icon={Hash} label="PIDs" value={memData.PIDs} />
                  </div>
                )}

                {/* History sparklines: parent-only, hidden when no data. */}
                {!selectedChild && history.samples.length > 1 && (
                  <div className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Sparkline
                        label="CPU %"
                        labels={history.samples.map((s) =>
                          new Date(s.ts).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        )}
                        values={history.samples.map((s) => s.cpu)}
                        color="#000000"
                        fillColor="rgba(0, 0, 0, 0.06)"
                      />
                      <Sparkline
                        label="Memory %"
                        labels={history.samples.map((s) =>
                          new Date(s.ts).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        )}
                        values={history.samples.map((s) => s.mem)}
                        color="#9ca3af"
                        fillColor="rgba(156, 163, 175, 0.18)"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-right">last hour</p>
                  </div>
                )}
              </div>

              {/* Terminal Section */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">Terminal</span>
                  </div>
                  <span className="text-sm text-gray-500 font-mono truncate">
                    {roomLabel}
                    {selectedChild ? ` › ${selectedChild.Name || selectedChild.ID}` : ''}
                  </span>
                </div>

                <div className="h-[28rem]">
                  <Cli
                    key={parentId}
                    containerId={parentId}
                    innerContainerId={selectedChild?.ID || undefined}
                    host={room?.host}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Node Modal (child container inside the workspace parent) */}
      {openModalCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => !creating && setOpenModalCreate(false)}
          ></div>

          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full p-8 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Create Node</h2>
              <button
                onClick={() => setOpenModalCreate(false)}
                disabled={creating}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                Creates a container inside this workspace&apos;s parent container
                (<span className="font-mono">{parentName}</span>).
              </p>

              <div>
                <label
                  htmlFor="child-name-input"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Name
                </label>
                <input
                  id="child-name-input"
                  type="text"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  disabled={creating}
                  className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 disabled:opacity-50 font-mono text-sm"
                  placeholder="my-node"
                />
                {childName && (
                  <p className="text-xs text-gray-400 font-mono mt-2">
                    Final name: {sanitizeNodeName(childName) || '?'}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="child-image-input"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Image
                </label>
                <input
                  id="child-image-input"
                  type="text"
                  value={childImage}
                  onChange={(e) => setChildImage(e.target.value)}
                  disabled={creating}
                  className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 disabled:opacity-50 font-mono text-sm"
                  placeholder={DEFAULT_CHILD_IMAGE}
                />
                <p className="text-xs text-gray-400 mt-2">
                  <span className="font-mono">docker:dind</span> lets this node run
                  Docker and have children of its own. Any image works, e.g.{' '}
                  <span className="font-mono">nginx:alpine</span>.
                </p>
              </div>

              <div>
                <label
                  htmlFor="child-shell-input"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Shell
                </label>
                <input
                  id="child-shell-input"
                  type="text"
                  value={childShell}
                  onChange={(e) => setChildShell(e.target.value)}
                  disabled={creating}
                  className="w-32 px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 disabled:opacity-50 font-mono text-sm"
                  placeholder={DEFAULT_CHILD_SHELL}
                />
              </div>

              {creationError && (
                <div className="p-4 rounded-2xl border text-sm bg-red-50 border-red-100 text-red-600 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                  {creationError}
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={createChild}
                  disabled={creating || !sanitizeNodeName(childName)}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 hover:shadow-lg focus:ring-2 focus:ring-black/20 focus:ring-offset-2 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md"
                >
                  {creating ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Node
                    </>
                  )}
                </button>
                <button
                  onClick={() => setOpenModalCreate(false)}
                  disabled={creating}
                  className="px-6 py-3 bg-white/50 border border-gray-200 text-gray-700 rounded-2xl hover:bg-white transition-all duration-200 font-semibold backdrop-blur-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install Plugin Modal */}
      {openModalInstall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => !installing && setOpenModalInstall(false)}
          ></div>

          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-white/20 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Install Plugin</h2>
              <button
                onClick={() => setOpenModalInstall(false)}
                disabled={installing}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/50 text-sm">
                <span className="text-gray-500">Install target: </span>
                <span className="font-mono font-medium text-gray-900">
                  {selectedChild
                    ? `${selectedChild.Name || selectedChild.ID} (inside ${parentName})`
                    : `workspace ${parentName}`}
                </span>
              </div>

              <div>
                <label
                  htmlFor="pluginSelect"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Plugin
                </label>
                {packagesLoading ? (
                  <div className="flex items-center space-x-2 text-gray-400 text-sm py-3">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Loading plugins...</span>
                  </div>
                ) : packagesError ? (
                  <div className="flex items-center justify-between text-sm text-red-500 py-2">
                    <span>{packagesError}</span>
                    <button
                      onClick={fetchPackages}
                      className="ml-3 text-red-500 hover:text-red-700"
                      title="Retry"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                ) : packages.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">
                    No plugins available in the registry.
                  </p>
                ) : (
                  <select
                    id="pluginSelect"
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    disabled={installing}
                    className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 disabled:opacity-50"
                  >
                    <option value="">Select a plugin...</option>
                    {packages.map((pkg) => (
                      <option key={pkg._id} value={pkg._id}>
                        {pkg.name}
                        {pkg.version ? ` — v${pkg.version}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {installResult && !installResult.ok && (
                <div className="p-4 rounded-2xl border text-sm bg-red-50 border-red-100 text-red-600">
                  {installResult.message}
                </div>
              )}

              {installResult && installResult.ok && (
                <div className="p-4 rounded-2xl border text-sm bg-gray-50/80 border-gray-200/50 space-y-3">
                  <p className="text-gray-900 font-medium">Plugin installed.</p>
                  {installResult.path && (
                    <p className="text-gray-600">
                      Path: <span className="font-mono">{installResult.path}</span>
                    </p>
                  )}
                  {installResult.files.length > 0 && (
                    <div>
                      <p className="text-gray-500 mb-1">Files:</p>
                      <ul className="font-mono text-xs text-gray-700 space-y-0.5">
                        {installResult.files.map((file) => (
                          <li key={file} className="truncate">
                            {file}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {installResult.installOutput && (
                    <div>
                      <p className="text-gray-500 mb-1">Install output:</p>
                      <pre className="bg-black text-gray-200 rounded-xl p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {installResult.installOutput}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={installPlugin}
                  disabled={installing || !selectedPackageId || !parentId}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 hover:shadow-lg focus:ring-2 focus:ring-black/20 focus:ring-offset-2 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md"
                >
                  {installing ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Package className="w-4 h-4 mr-2" />
                      Install
                    </>
                  )}
                </button>
                <button
                  onClick={() => setOpenModalInstall(false)}
                  disabled={installing}
                  className="px-6 py-3 bg-white/50 border border-gray-200 text-gray-700 rounded-2xl hover:bg-white transition-all duration-200 font-semibold backdrop-blur-sm disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Network Topology Modal */}
      {openModalGraph && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => setOpenModalGraph(false)}
          ></div>

          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-6xl h-[80vh] border border-white/20 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50 bg-white/50 backdrop-blur-sm">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Network className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Network Topology</h2>
              </div>
              <button
                onClick={() => setOpenModalGraph(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 rounded-xl transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full h-[calc(80vh-88px)] p-6">
              <div className="w-full h-full rounded-2xl overflow-hidden">
                <Graph
                  roomNodes={
                    parent
                      ? [
                          {
                            id: parent.ID,
                            name: roomLabel,
                            status: parentRunning ? 'running' : 'stopped',
                            ip: parent.IP,
                            children: children.map((child) => ({
                              id: child.ID,
                              name: child.Name,
                              image: child.Image,
                              status: isRunning(child.Status) ? 'running' : 'stopped',
                              ip: child.IP
                            }))
                          }
                        ]
                      : []
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
