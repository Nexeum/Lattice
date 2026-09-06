import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Server,
  Terminal,
  Activity,
  Network,
  X,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi,
  Container,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { Cli } from './Cli';
import { Graph } from './Graph';
import { authHeaders, redirectIfUnauthorized } from '../lib/api';

const API_BASE = 'http://localhost:5001';

const shortId = (id) => (typeof id === 'string' ? id.slice(0, 12) : '');

// "0.15%" -> 0.15 (clamped to [0, 100]); null when unparseable
const parsePercent = (value) => {
  const numeric = parseFloat(String(value ?? '').replace('%', ''));
  if (!Number.isFinite(numeric)) return null;
  return Math.min(Math.max(numeric, 0), 100);
};

const MetricBar = ({ icon: Icon, iconColor, barColor, label, percent }) => (
  <div className="bg-gray-50 rounded-xl p-4">
    <div className="flex items-center space-x-2 mb-2">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className="text-sm font-medium text-gray-600">{label}</span>
    </div>
    <div className="flex items-center space-x-3">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`${barColor} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percent ?? 0}%` }}
        ></div>
      </div>
      <span className="text-sm font-medium text-gray-900">
        {percent !== null ? `${percent}%` : '—'}
      </span>
    </div>
  </div>
);

const MetricRows = ({ icon: Icon, iconColor, label, rows }) => (
  <div className="bg-gray-50 rounded-xl p-4">
    <div className="flex items-center space-x-2 mb-2">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className="text-sm font-medium text-gray-600">{label}</span>
    </div>
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{row.label}</span>
          <span className="font-medium text-gray-900 font-mono text-xs">
            {row.value || '—'}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const Node = () => {
  const { roomId, nodeId } = useParams();

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(null);

  const [innerContainers, setInnerContainers] = useState([]);
  const [psLoading, setPsLoading] = useState(true);
  const [psError, setPsError] = useState(null);

  const [selectedInner, setSelectedInner] = useState(null);
  const [openTopologyModal, setOpenTopologyModal] = useState(false);

  const fetchMetrics = useCallback(async () => {
    if (!nodeId) return;
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const response = await fetch(
        `${API_BASE}/container/${encodeURIComponent(nodeId)}/metrics`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Metrics request failed with status ${response.status}`);
      }
      const data = await response.json();
      if (!data || typeof data !== 'object') {
        throw new Error('Unexpected metrics response');
      }
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch node metrics:', error);
      setMetricsError('Could not load metrics for this node.');
    } finally {
      setMetricsLoading(false);
    }
  }, [nodeId]);

  const fetchInnerContainers = useCallback(async () => {
    if (!nodeId) return;
    setPsLoading(true);
    setPsError(null);
    try {
      const response = await fetch(
        `${API_BASE}/containers/${encodeURIComponent(nodeId)}/ps`,
        { headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`ps request failed with status ${response.status}`);
      }
      const data = await response.json();
      const list = Array.isArray(data?.output) ? data.output : [];
      setInnerContainers(list);
      // Drop the selection if the selected container is gone
      setSelectedInner((prev) =>
        prev && list.some((c) => c.ID === prev.ID) ? prev : null
      );
    } catch (error) {
      console.error('Failed to fetch nested containers:', error);
      setInnerContainers([]);
      setSelectedInner(null);
      setPsError(null); // Not all nodes run Docker inside — treat as empty
    } finally {
      setPsLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    fetchMetrics();
    fetchInnerContainers();
  }, [fetchMetrics, fetchInnerContainers]);

  const refreshAll = () => {
    fetchMetrics();
    fetchInnerContainers();
  };

  const toggleInnerSelection = (container) => {
    setSelectedInner((prev) =>
      prev && prev.ID === container.ID ? null : container
    );
  };

  const cpuPercent = parsePercent(metrics?.CPUPerc);
  const memPercent = parsePercent(metrics?.MemPerc);
  const refreshing = metricsLoading || psLoading;

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Server className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-light text-gray-900">
                  Node <span className="font-mono">{shortId(nodeId)}</span>
                </h1>
                <p className="text-gray-600">Workspace: {roomId}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setOpenTopologyModal(true)}
                className="flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium"
              >
                <Network className="w-4 h-4" />
                <span>Network Topology</span>
              </button>
            </div>
          </div>

          {/* Metrics */}
          {metricsLoading && !metrics ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
              <span className="ml-3 text-gray-500 text-sm">
                Collecting container stats…
              </span>
            </div>
          ) : metricsError ? (
            <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl p-4">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{metricsError}</span>
              </div>
              <button
                onClick={fetchMetrics}
                className="text-sm font-medium text-red-700 hover:text-red-900 underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricBar
                icon={Cpu}
                iconColor="text-blue-600"
                barColor="bg-blue-600"
                label="CPU Usage"
                percent={cpuPercent}
              />
              <MetricBar
                icon={Activity}
                iconColor="text-green-600"
                barColor="bg-green-600"
                label="Memory"
                percent={memPercent}
              />
              <MetricRows
                icon={HardDrive}
                iconColor="text-purple-600"
                label="I/O"
                rows={[
                  { label: 'Net I/O', value: metrics?.NetIO },
                  { label: 'Block I/O', value: metrics?.BlockIO },
                ]}
              />
              <MetricRows
                icon={Wifi}
                iconColor="text-orange-600"
                label="Processes"
                rows={[
                  { label: 'Mem Usage', value: metrics?.MemUsage },
                  { label: 'PIDs', value: metrics?.PIDs },
                ]}
              />
            </div>
          )}
        </div>

        {/* Terminal */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Terminal</span>
            </div>
            {selectedInner ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500 font-mono truncate">
                  {selectedInner.Name || shortId(selectedInner.ID)}
                </span>
                <button
                  onClick={() => setSelectedInner(null)}
                  className="text-sm text-gray-500 hover:text-gray-800 underline"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <span className="text-sm text-gray-500 font-mono">
                node {shortId(nodeId)}
              </span>
            )}
          </div>
          <div className="h-[28rem]">
            <Cli
              containerId={nodeId}
              innerContainerId={selectedInner ? selectedInner.ID : undefined}
            />
          </div>
        </div>

        {/* Nested containers */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-medium text-gray-900">Nested Containers</h2>
            </div>
            {innerContainers.length > 0 && (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                {innerContainers.length} found
              </span>
            )}
          </div>

          {psLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
            </div>
          ) : psError ? (
            <div className="flex items-center space-x-2 text-red-700 bg-red-50 border border-red-100 rounded-xl p-4">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{psError}</span>
            </div>
          ) : innerContainers.length === 0 ? (
            <div className="text-center py-10">
              <Container className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No nested containers</p>
              <p className="text-sm text-gray-400 mt-1">
                This node is not running any containers inside it.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Select a container to run terminal commands inside it.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {innerContainers.map((container) => {
                  const isSelected = selectedInner && selectedInner.ID === container.ID;
                  return (
                    <button
                      key={container.ID}
                      onClick={() => toggleInnerSelection(container)}
                      className={`text-left p-4 border rounded-xl transition-all duration-200 ${
                        isSelected
                          ? 'border-black ring-2 ring-black/10 shadow-md bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              String(container.Status || '')
                                .toLowerCase()
                                .startsWith('up')
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}
                          ></div>
                          <h3 className="font-medium text-gray-900">
                            {container.Name || shortId(container.ID)}
                          </h3>
                        </div>
                        {isSelected && (
                          <span className="px-2 py-0.5 bg-black text-white rounded-full text-xs font-medium">
                            Connected
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Container className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{container.Image || '—'}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Wifi className="w-3 h-3 flex-shrink-0" />
                          <span className="font-mono text-xs">
                            {container.IP || '—'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Activity className="w-3 h-3 flex-shrink-0" />
                          <span>{container.Status || '—'}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Network Topology Modal */}
      {openTopologyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setOpenTopologyModal(false)}
          ></div>

          <div className="relative bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-gray-900">Network Topology</h2>
              <button
                onClick={() => setOpenTopologyModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="h-[60vh] overflow-auto">
              <Graph
                roomNodes={[
                  {
                    id: nodeId,
                    name: `node ${String(nodeId).slice(0, 12)}`,
                    status: 'running',
                    ip: '-',
                    children: innerContainers.map((child) => ({
                      id: child.ID,
                      name: child.Name,
                      image: child.Image,
                      status: String(child.Status || '')
                        .toLowerCase()
                        .startsWith('up')
                        ? 'running'
                        : 'stopped',
                      ip: child.IP
                    }))
                  }
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
