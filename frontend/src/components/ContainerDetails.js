import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import {
  Activity,
  AlertTriangle,
  Box,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
} from 'lucide-react';
import { authHeaders, redirectIfUnauthorized } from '../lib/api';

Chart.register(...registerables);

const API_BASE = 'http://localhost:5001';
const CPU_WINDOW = 8;
const POLL_INTERVAL_MS = 5000;
const MAX_METRIC_FAILURES = 3;

const GRID_COLOR = '#f3f4f6';
const TICK_COLOR = '#9ca3af';

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111827',
      titleColor: '#f9fafb',
      bodyColor: '#f9fafb',
      cornerRadius: 8,
      padding: 10,
    },
  },
  scales: {
    x: {
      grid: { color: GRID_COLOR },
      ticks: { color: TICK_COLOR, font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: GRID_COLOR },
      ticks: { color: TICK_COLOR, font: { size: 11 } },
    },
  },
};

function parsePercentage(percentage) {
  const value = parseFloat(percentage);
  return Number.isFinite(value) ? value : 0;
}

function isRunningStatus(status) {
  return typeof status === 'string' && status.toLowerCase().startsWith('up');
}

const StatusBadge = ({ status }) => {
  const running = isRunningStatus(status);
  return (
    <span
      className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium ${
        running ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-500' : 'bg-gray-400'}`}
      />
      <span>{status || 'Unknown'}</span>
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value }) => (
  <div className="bg-white rounded-2xl p-6 border border-gray-100">
    <div className="flex items-center space-x-2 text-gray-400 mb-2">
      <Icon className="w-4 h-4" />
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-lg font-light text-gray-900 truncate" title={value}>
      {value || '—'}
    </p>
  </div>
);

const LoadingSkeleton = () => (
  <div className="p-8 space-y-6 animate-pulse">
    <div className="bg-white rounded-2xl p-8 border border-gray-100 space-y-4">
      <div className="h-8 w-64 bg-gray-100 rounded-full" />
      <div className="h-4 w-96 bg-gray-100 rounded-full" />
      <div className="h-4 w-48 bg-gray-100 rounded-full" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-gray-100 h-80" />
      <div className="bg-white rounded-2xl border border-gray-100 h-80" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-gray-100 h-28" />
      <div className="bg-white rounded-2xl border border-gray-100 h-28" />
    </div>
  </div>
);

export const ContainerDetails = () => {
  const { id } = useParams();

  const [container, setContainer] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [cpuPercData, setCpuPercData] = useState([]);
  const [timestamps, setTimestamps] = useState([]);
  const [metricFailures, setMetricFailures] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    axios
      .get(`${API_BASE}/containers`, { headers: { ...authHeaders() } })
      .then((response) => {
        if (cancelled || !Array.isArray(response.data)) return;
        const match = response.data.find(
          (c) =>
            typeof c.ID === 'string' &&
            (c.ID.startsWith(id) || id.startsWith(c.ID))
        );
        if (match) {
          setContainer(match);
        }
      })
      .catch((error) => {
        console.error('Failed to load container info', error);
        if (redirectIfUnauthorized(error.response)) return;
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = () => {
      axios
        .get(`${API_BASE}/container/${id}/metrics`, { headers: { ...authHeaders() } })
        .then((response) => {
          if (cancelled) return;
          const data = response.data || {};
          setMetrics(data);
          setMetricFailures(0);
          setInitialLoading(false);
          setCpuPercData((prev) => {
            const next = [...prev, parsePercentage(data.CPUPerc)];
            return next.length > CPU_WINDOW ? next.slice(1) : next;
          });
          setTimestamps((prev) => {
            const next = [...prev, new Date().toLocaleTimeString()];
            return next.length > CPU_WINDOW ? next.slice(1) : next;
          });
        })
        .catch((error) => {
          console.error('Failed to load container metrics', error);
          if (redirectIfUnauthorized(error.response)) return;
          if (cancelled) return;
          setMetricFailures((prev) => prev + 1);
          setInitialLoading(false);
        });
    };

    fetchMetrics();
    const intervalId = setInterval(fetchMetrics, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [id]);

  const cpuChartData = useMemo(
    () => ({
      labels: timestamps,
      datasets: [
        {
          label: 'CPU %',
          data: cpuPercData,
          fill: true,
          backgroundColor: 'rgba(17, 24, 39, 0.05)',
          borderColor: '#111827',
          pointBackgroundColor: '#111827',
          pointRadius: 3,
          borderWidth: 2,
          tension: 0.3,
        },
      ],
    }),
    [timestamps, cpuPercData]
  );

  const memPerc = metrics ? parsePercentage(metrics.MemPerc) : 0;
  const metricsUnavailable = metricFailures >= MAX_METRIC_FAILURES;

  if (initialLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-3 mb-2">
              <Box className="w-6 h-6 text-gray-400" />
              <h1 className="text-3xl font-light text-gray-900 truncate">
                {container?.Names || `Container ${id}`}
              </h1>
              <StatusBadge status={container?.Status} />
            </div>
            <p className="text-sm text-gray-500 font-mono truncate">
              {container?.Image || id}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-gray-600">
              {container?.IP && (
                <span className="flex items-center space-x-1.5">
                  <Network className="w-4 h-4 text-gray-400" />
                  <span>{container.IP}{container?.Port ? `:${container.Port}` : ''}</span>
                </span>
              )}
              {container?.RunningFor && (
                <span className="flex items-center space-x-1.5">
                  <Activity className="w-4 h-4 text-gray-400" />
                  <span>{container.RunningFor}</span>
                </span>
              )}
              <span className="flex items-center space-x-1.5">
                <Gauge className="w-4 h-4 text-gray-400" />
                <span>{metrics?.PIDs ? `${metrics.PIDs} PIDs` : 'PIDs —'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics error */}
      {metricsUnavailable && (
        <div className="bg-white rounded-2xl p-6 border border-red-100 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Metrics unavailable</p>
            <p className="text-sm text-gray-500">
              We couldn't fetch metrics for this container. It may have stopped, or the
              agent on port 5001 is unreachable. Retrying automatically…
            </p>
          </div>
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center space-x-2 mb-4">
            <Cpu className="w-4 h-4 text-gray-400" />
            <h2 className="text-lg font-light text-gray-900">CPU Usage</h2>
            <span className="ml-auto text-sm text-gray-500">
              {metrics?.CPUPerc || '—'}
            </span>
          </div>
          <div className="h-64">
            <Line data={cpuChartData} options={baseChartOptions} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center space-x-2 mb-4">
            <MemoryStick className="w-4 h-4 text-gray-400" />
            <h2 className="text-lg font-light text-gray-900">Memory</h2>
            <span className="ml-auto text-sm text-gray-500">
              {metrics?.MemPerc || '—'}
            </span>
          </div>
          <div className="h-64 flex flex-col justify-center">
            <p className="text-3xl font-light text-gray-900 mb-6 text-center">
              {metrics?.MemUsage || '—'}
            </p>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-black rounded-full transition-all duration-500"
                style={{ width: `${Math.min(Math.max(memPerc, 0), 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              {memPerc.toFixed(2)}% of available memory
            </p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard icon={Network} label="Network I/O" value={metrics?.NetIO} />
        <StatCard icon={HardDrive} label="Block I/O" value={metrics?.BlockIO} />
      </div>
    </div>
  );
};
