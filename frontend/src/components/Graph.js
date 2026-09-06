import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ReactFlow,
    Background,
    MiniMap,
    Controls,
    Handle,
    Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Server, Box, Network, RefreshCw, X } from 'lucide-react';

const TOPOLOGY_URL = 'http://localhost:5001/topology';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const WORKSPACE_W = 230;
const CONTAINER_W = 200;
const CONTAINER_H = 96;
const NETWORK_W = 190;
const NETWORK_H = 56;

const CHILD_SPACING = 260;   // horizontal spacing between sibling containers
const GRAND_SPACING = 230;   // spacing between grandchildren
const ROW_CHILDREN_Y = 220;  // children row (below workspace)
const ROW_GRAND_Y = 430;     // grandchildren row
const CLUSTER_GAP_X = 120;   // gap between workspace clusters (room mode)
const HOST_CLUSTER_SPACING = 700; // grid spacing between network clusters

// Deterministic per-network edge palette.
const NETWORK_PALETTE = [
    '#3b82f6', // blue-500
    '#a855f7', // purple-500
    '#14b8a6', // teal-500
    '#f59e0b', // amber-500
    '#f43f5e', // rose-500
    '#6366f1'  // indigo-500
];

const networkColor = (index) => NETWORK_PALETTE[index % NETWORK_PALETTE.length];

const EDGE_STROKE = '#94a3b8'; // slate-400

// Handles exist so edges can attach, but they should not read as sockets.
const HANDLE_STYLE = {
    width: 6,
    height: 6,
    minWidth: 0,
    minHeight: 0,
    background: 'transparent',
    border: 'none'
};

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

const StatusPill = ({ status, floating = false }) => {
    const running = status === 'running';
    const tone = running
        ? 'bg-green-50 text-green-700 ring-green-200'
        : 'bg-gray-100 text-gray-500 ring-gray-200';
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${tone} ${
                floating ? 'shadow-sm bg-opacity-100' : ''
            }`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${
                    running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}
            />
            {status || 'unknown'}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Custom nodes
// ---------------------------------------------------------------------------

// Workspace / DinD parent — dark gradient header card.
const WorkspaceNode = ({ data, selected }) => (
    <div
        className={`w-[230px] rounded-2xl bg-white shadow-lg ring-1 overflow-hidden transition-shadow ${
            selected ? 'ring-2 ring-blue-400' : 'ring-gray-900/10'
        }`}
    >
        <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-3.5 py-2.5 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Server className="w-4 h-4 text-white" />
            </span>
            <span className="text-sm font-semibold text-white truncate">{data.name}</span>
        </div>
        <div className="px-3.5 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-gray-500 truncate">{data.image}</span>
                <StatusPill status={data.status} />
            </div>
            <div className="font-mono text-xs text-gray-400">{data.ip || '—'}</div>
        </div>
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={HANDLE_STYLE} />
    </div>
);

// Container — white card with icon avatar and floating status pill.
const ContainerNode = ({ data, selected }) => (
    <div
        className={`relative w-[200px] rounded-xl bg-white border shadow-md hover:shadow-lg transition-shadow ${
            selected ? 'border-blue-300 ring-2 ring-blue-400' : 'border-gray-200'
        }`}
    >
        <span className="absolute -top-2 -right-2 z-10">
            <StatusPill status={data.status} floating />
        </span>
        <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Box className="w-3.5 h-3.5 text-blue-600" />
                </span>
                <span className="text-sm font-semibold text-gray-800 truncate">{data.name}</span>
            </div>
            <div className="mt-2 space-y-0.5">
                <div className="font-mono text-xs text-gray-500 truncate">{data.image}</div>
                <div className="font-mono text-xs text-gray-400">{data.ip || '—'}</div>
            </div>
        </div>
        <Handle type="target" position={Position.Top} id="t-top" style={HANDLE_STYLE} />
        <Handle type="target" position={Position.Left} id="t-left" style={HANDLE_STYLE} />
        <Handle type="target" position={Position.Right} id="t-right" style={HANDLE_STYLE} />
        <Handle type="target" position={Position.Bottom} id="t-bottom" style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={HANDLE_STYLE} />
    </div>
);

// Network hub (host mode) — compact pill acting as the cluster center.
const NetworkNode = ({ data, selected }) => (
    <div
        className={`w-[190px] flex items-center gap-2.5 px-4 py-2 rounded-full bg-white shadow-md ring-1 transition-shadow ${
            selected ? 'ring-2 ring-blue-400' : 'ring-gray-200'
        }`}
    >
        <span
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${data.color}1f` }}
        >
            <Network className="w-3.5 h-3.5" style={{ color: data.color }} />
        </span>
        <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-800 truncate">{data.name}</span>
            <span className="block text-[10px] text-gray-400 truncate">{data.driver || 'bridge'}</span>
        </span>
        <Handle type="source" position={Position.Top} id="s-top" style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Right} id="s-right" style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Left} id="s-left" style={HANDLE_STYLE} />
    </div>
);

// Module scope so React Flow never sees a new object identity per render.
const NODE_TYPES = {
    workspace: WorkspaceNode,
    container: ContainerNode,
    network: NetworkNode
};

// ---------------------------------------------------------------------------
// Graph builders (pure — return { nodes, edges })
// ---------------------------------------------------------------------------

const isRunning = (status) => status === 'running';

// Room mode: top-down tree per workspace. Parent top-center, children in a
// centered row beneath, grandchildren (if the data ever grows a level) in a
// third row under their own parent.
const buildRoomGraph = (roomNodes) => {
    const clusters = roomNodes
        .filter((parent) => parent?.id)
        .map((parent) => {
            const children = Array.isArray(parent.children) ? parent.children : [];
            const subtrees = children
                .filter((child) => child?.id)
                .map((child) => {
                    const grandchildren = Array.isArray(child.children)
                        ? child.children.filter((g) => g?.id)
                        : [];
                    return {
                        child,
                        grandchildren,
                        width: Math.max(CHILD_SPACING, grandchildren.length * GRAND_SPACING)
                    };
                });
            const childrenWidth = subtrees.reduce((sum, t) => sum + t.width, 0);
            return { parent, subtrees, width: Math.max(WORKSPACE_W + 40, childrenWidth) };
        });

    const clusterOffsets = clusters.reduce(
        (acc, cluster) => ({
            offsets: [...acc.offsets, acc.x],
            x: acc.x + cluster.width + CLUSTER_GAP_X
        }),
        { offsets: [], x: 0 }
    ).offsets;

    return clusters.reduce(
        (graph, cluster, ci) => {
            const { parent, subtrees, width } = cluster;
            const centerX = clusterOffsets[ci] + width / 2;
            const childrenWidth = subtrees.reduce((sum, t) => sum + t.width, 0);
            const childrenStartX = centerX - childrenWidth / 2;

            const parentNode = {
                id: parent.id,
                type: 'workspace',
                position: { x: centerX - WORKSPACE_W / 2, y: 0 },
                data: {
                    name: parent.name || parent.id.slice(0, 12),
                    image: 'docker:dind',
                    ip: parent.ip,
                    status: parent.status || 'unknown',
                    kind: 'workspace'
                }
            };

            const childOffsets = subtrees.reduce(
                (acc, subtree) => ({
                    offsets: [...acc.offsets, acc.x],
                    x: acc.x + subtree.width
                }),
                { offsets: [], x: childrenStartX }
            ).offsets;

            const childParts = subtrees.map((subtree, i) => {
                const { child, grandchildren } = subtree;
                const childId = `${parent.id}-${child.id}`;
                const childCenterX = childOffsets[i] + subtree.width / 2;

                const childNode = {
                    id: childId,
                    type: 'container',
                    position: { x: childCenterX - CONTAINER_W / 2, y: ROW_CHILDREN_Y },
                    data: {
                        name: child.name || child.id.slice(0, 12),
                        image: child.image || 'unknown',
                        ip: child.ip,
                        status: child.status || 'unknown',
                        parentName: parent.name
                    }
                };

                const childEdge = {
                    id: `e-${parent.id}-${childId}`,
                    source: parent.id,
                    sourceHandle: 's-bottom',
                    target: childId,
                    targetHandle: 't-top',
                    type: 'smoothstep',
                    animated: isRunning(parent.status) && isRunning(child.status),
                    style: { stroke: EDGE_STROKE, strokeWidth: 1.5 }
                };

                const grandStartX =
                    childCenterX - (grandchildren.length * GRAND_SPACING) / 2;
                const grandNodes = grandchildren.map((grand, gi) => ({
                    id: `${childId}-${grand.id}`,
                    type: 'container',
                    position: {
                        x: grandStartX + gi * GRAND_SPACING + (GRAND_SPACING - CONTAINER_W) / 2,
                        y: ROW_GRAND_Y
                    },
                    data: {
                        name: grand.name || grand.id.slice(0, 12),
                        image: grand.image || 'unknown',
                        ip: grand.ip,
                        status: grand.status || 'unknown',
                        parentName: child.name
                    }
                }));

                const grandEdges = grandchildren.map((grand) => ({
                    id: `e-${childId}-${grand.id}`,
                    source: childId,
                    sourceHandle: 's-bottom',
                    target: `${childId}-${grand.id}`,
                    targetHandle: 't-top',
                    type: 'smoothstep',
                    animated: isRunning(child.status) && isRunning(grand.status),
                    style: { stroke: EDGE_STROKE, strokeWidth: 1.5 }
                }));

                return {
                    nodes: [childNode, ...grandNodes],
                    edges: [childEdge, ...grandEdges]
                };
            });

            return {
                nodes: [
                    ...graph.nodes,
                    parentNode,
                    ...childParts.flatMap((p) => p.nodes)
                ],
                edges: [...graph.edges, ...childParts.flatMap((p) => p.edges)]
            };
        },
        { nodes: [], edges: [] }
    );
};

// Picks the hub/container handle pair that best matches the geometric
// direction between them so bezier edges leave from the natural side.
const pickHandles = (dx, dy) => {
    if (Math.abs(dy) >= Math.abs(dx)) {
        return dy >= 0
            ? { sourceHandle: 's-bottom', targetHandle: 't-top' }
            : { sourceHandle: 's-top', targetHandle: 't-bottom' };
    }
    return dx >= 0
        ? { sourceHandle: 's-right', targetHandle: 't-left' }
        : { sourceHandle: 's-left', targetHandle: 't-right' };
};

// Host mode: one cluster per network — a hub pill with its containers in a
// ring around it, clusters on a 2-per-row grid. Containers shared across
// networks render once (in the first network that lists them) and receive
// one colored edge per network membership.
const buildHostGraph = (networks) => {
    const validNetworks = networks.filter((net) => net?.id);

    const membershipMap = validNetworks.reduce(
        (acc, net) =>
            (net.containers || [])
                .filter((c) => c?.id)
                .reduce(
                    (inner, c) => ({
                        ...inner,
                        [c.id]: inner[c.id]?.includes(net.name)
                            ? inner[c.id]
                            : [...(inner[c.id] || []), net.name]
                    }),
                    acc
                ),
        {}
    );

    const containerById = validNetworks.reduce(
        (acc, net) =>
            (net.containers || [])
                .filter((c) => c?.id)
                .reduce((inner, c) => ({ ...inner, [c.id]: inner[c.id] || c }), acc),
        {}
    );

    // Each container is "owned" (positioned) by the first network listing it.
    const ownership = validNetworks.reduce(
        (acc, net) => {
            const fresh = (net.containers || []).filter(
                (c, i, arr) =>
                    c?.id &&
                    acc.owner[c.id] === undefined &&
                    arr.findIndex((o) => o?.id === c.id) === i
            );
            return {
                owner: {
                    ...acc.owner,
                    ...Object.fromEntries(fresh.map((c) => [c.id, net.id]))
                },
                byNetwork: { ...acc.byNetwork, [net.id]: fresh }
            };
        },
        { owner: {}, byNetwork: {} }
    );

    const clusterCenter = (index) => ({
        x: (index % 2) * HOST_CLUSTER_SPACING,
        y: Math.floor(index / 2) * HOST_CLUSTER_SPACING
    });

    const containerCenters = validNetworks.reduce((acc, net, k) => {
        const { x: cx, y: cy } = clusterCenter(k);
        const ring = ownership.byNetwork[net.id] || [];
        const radius = Math.max(215, 100 + ring.length * 26);
        const startAngle = ring.length === 1 ? 90 : -90;
        return ring.reduce((inner, c, i) => {
            const angle = ((startAngle + (360 / ring.length) * i) * Math.PI) / 180;
            return {
                ...inner,
                [c.id]: {
                    x: cx + radius * Math.cos(angle),
                    y: cy + radius * Math.sin(angle)
                }
            };
        }, acc);
    }, {});

    const hubNodes = validNetworks.map((net, k) => {
        const { x, y } = clusterCenter(k);
        return {
            id: `net-${net.id}`,
            type: 'network',
            position: { x: x - NETWORK_W / 2, y: y - NETWORK_H / 2 },
            data: {
                name: net.name || net.id.slice(0, 12),
                driver: net.driver,
                color: networkColor(k),
                kind: 'network'
            }
        };
    });

    const containerNodes = validNetworks.flatMap((net) =>
        (ownership.byNetwork[net.id] || []).map((c) => {
            const center = containerCenters[c.id];
            return {
                id: c.id,
                type: 'container',
                position: {
                    x: center.x - CONTAINER_W / 2,
                    y: center.y - CONTAINER_H / 2
                },
                data: {
                    name: c.name || c.id.slice(0, 12),
                    image: c.image || 'unknown',
                    ip: c.ip,
                    status: c.status || 'unknown',
                    networks: membershipMap[c.id] || []
                }
            };
        })
    );

    const edges = validNetworks.flatMap((net, k) => {
        const { x: cx, y: cy } = clusterCenter(k);
        const color = networkColor(k);
        const ids = [
            ...new Set((net.containers || []).filter((c) => c?.id).map((c) => c.id))
        ];
        return ids.map((id, i) => {
            const center = containerCenters[id];
            const handles = pickHandles(center.x - cx, center.y - cy);
            return {
                id: `e-${net.id}-${id}`,
                source: `net-${net.id}`,
                target: id,
                type: 'default',
                animated: isRunning(containerById[id]?.status),
                style: { stroke: color, strokeWidth: 1.5, opacity: 0.85 },
                ...(i === 0
                    ? {
                        label: net.name,
                        labelStyle: { fill: '#64748b', fontSize: 10, fontWeight: 500 },
                        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 },
                        labelBgPadding: [4, 2],
                        labelBgBorderRadius: 4
                    }
                    : {}),
                ...handles
            };
        });
    });

    return { nodes: [...hubNodes, ...containerNodes], edges };
};

// ---------------------------------------------------------------------------
// Chrome around the canvas
// ---------------------------------------------------------------------------

const Legend = ({ networks, isRoomScoped }) => (
    <div className="flex items-center gap-4 flex-wrap">
        {!isRoomScoped &&
            networks.map((network, index) => (
                <span key={network.id} className="flex items-center gap-1.5">
                    <span
                        className="inline-block w-4 h-1 rounded-full"
                        style={{ backgroundColor: networkColor(index) }}
                    />
                    <span className="text-xs text-gray-500">{network.name}</span>
                </span>
            ))}
        <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-500">Running</span>
        </span>
        <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-xs text-gray-500">Stopped</span>
        </span>
    </div>
);

const DetailPanel = ({ item, onClose }) => (
    <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
                {item.kind === 'workspace' ? (
                    <Server className="w-4 h-4 text-gray-700" />
                ) : item.kind === 'network' ? (
                    <Network className="w-4 h-4 text-gray-700" />
                ) : (
                    <Box className="w-4 h-4 text-blue-600" />
                )}
                <h4 className="text-sm font-semibold text-gray-800">{item.name}</h4>
            </div>
            <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-0.5"
                aria-label="Close details"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
                <dt className="text-gray-400">Image</dt>
                <dd className="text-gray-700 font-mono break-all">
                    {item.image || (item.kind === 'network' ? `driver: ${item.driver || 'bridge'}` : '—')}
                </dd>
            </div>
            <div>
                <dt className="text-gray-400">IP</dt>
                <dd className="text-gray-700 font-mono">{item.ip || '—'}</dd>
            </div>
            <div>
                <dt className="text-gray-400">Status</dt>
                <dd>
                    {item.kind === 'network' ? (
                        <span className="text-gray-500 font-medium">network</span>
                    ) : (
                        <StatusPill status={item.status} />
                    )}
                </dd>
            </div>
            <div>
                <dt className="text-gray-400">
                    {Array.isArray(item.networks) ? 'Networks' : 'Parent'}
                </dt>
                <dd className="text-gray-700 font-medium break-all">
                    {Array.isArray(item.networks)
                        ? item.networks.length
                            ? item.networks.join(', ')
                            : 'none'
                        : item.parentName || '—'}
                </dd>
            </div>
        </dl>
    </div>
);

const minimapNodeColor = (node) => {
    if (node.type === 'network') return '#dbeafe';
    return node.data?.status === 'running' ? '#bbf7d0' : '#e5e7eb';
};

// ---------------------------------------------------------------------------
// Graph — two modes:
// - Room mode (`roomNodes` prop): renders the workspace tree, no fetching.
// - Host mode (no props): fetches the Docker network topology itself.
// ---------------------------------------------------------------------------

export const Graph = ({ roomNodes = null }) => {
    const isRoomScoped = Array.isArray(roomNodes);
    const [networks, setNetworks] = useState([]);
    const [loading, setLoading] = useState(!isRoomScoped);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);

    const fetchTopology = useCallback(async () => {
        if (isRoomScoped) return;
        setLoading(true);
        setError(null);
        setSelected(null);
        try {
            const response = await fetch(TOPOLOGY_URL);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const data = await response.json();
            if (!data || !Array.isArray(data.networks)) {
                throw new Error('Unexpected topology response format');
            }
            setNetworks(data.networks);
        } catch (err) {
            console.error('Failed to load topology', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [isRoomScoped]);

    useEffect(() => {
        fetchTopology();
    }, [fetchTopology]);

    const graph = useMemo(
        () => (isRoomScoped ? buildRoomGraph(roomNodes) : buildHostGraph(networks)),
        [isRoomScoped, roomNodes, networks]
    );

    // Remount React Flow when the topology actually changes so the
    // uncontrolled (draggable) nodes reset and fitView re-runs.
    const flowKey = useMemo(
        () => graph.nodes.map((node) => node.id).join('|'),
        [graph.nodes]
    );

    const handleNodeClick = useCallback((_, node) => {
        setSelected({ ...node.data });
    }, []);

    const handlePaneClick = useCallback(() => {
        setSelected(null);
    }, []);

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
                <Legend networks={networks} isRoomScoped={isRoomScoped} />
                {!isRoomScoped && (
                    <button
                        onClick={fetchTopology}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                )}
            </div>

            {error ? (
                <div className="w-full h-[500px] flex items-center justify-center bg-gray-50/50 border border-gray-200 rounded-xl">
                    <div className="text-center px-6">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                            Could not load network topology
                        </p>
                        <p className="text-xs text-gray-500 mb-3">{error}</p>
                        <button
                            onClick={fetchTopology}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            ) : (
                <div className="relative w-full h-[500px] rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80">
                            <p className="inline-flex items-center gap-2 text-sm text-gray-500">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Loading topology…
                            </p>
                        </div>
                    )}
                    {!loading && graph.nodes.length === 0 && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                            <p className="text-sm text-gray-500">
                                {isRoomScoped
                                    ? 'This workspace has no nodes yet'
                                    : 'No containers found'}
                            </p>
                        </div>
                    )}
                    <ReactFlow
                        key={flowKey}
                        defaultNodes={graph.nodes}
                        defaultEdges={graph.edges}
                        nodeTypes={NODE_TYPES}
                        onNodeClick={handleNodeClick}
                        onPaneClick={handlePaneClick}
                        fitView
                        fitViewOptions={{ padding: 0.25 }}
                        minZoom={0.3}
                        maxZoom={2.5}
                        nodesDraggable
                        nodesConnectable={false}
                        deleteKeyCode={null}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background variant="dots" gap={22} size={1.5} color="#e2e8f0" />
                        <MiniMap
                            position="bottom-right"
                            nodeColor={minimapNodeColor}
                            nodeStrokeColor="#cbd5e1"
                            maskColor="rgb(248,250,252,0.7)"
                            pannable
                            zoomable
                        />
                        <Controls position="bottom-left" showInteractive={false} />
                    </ReactFlow>
                </div>
            )}

            {selected && <DetailPanel item={selected} onClose={() => setSelected(null)} />}
        </div>
    );
};
