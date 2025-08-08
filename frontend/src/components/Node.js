import React, { useEffect, useState } from 'react';
import { 
  Server, 
  Terminal, 
  Activity, 
  Network, 
  Settings, 
  X, 
  RefreshCw,
  Eye,
  Play,
  Square,
  Cpu,
  HardDrive,
  Wifi,
  Container,
  ArrowUpDown,
  Clock
} from 'lucide-react';

// Mock CLI Component - replace with your actual Cli component
const Cli = () => {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([
    '$ docker ps',
    'CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS',
    '1a2b3c4d5e6f   nginx:alpine   "/docker-entrypoint.…"   2 hours ago     Up 2 hours',
    '7g8h9i0j1k2l   redis:latest   "docker-entrypoint.s…"   3 hours ago     Up 3 hours',
    '$ '
  ]);

  const handleCommand = (e) => {
    if (e.key === 'Enter') {
      const newOutput = [...output, `$ ${command}`, 'Command executed successfully'];
      setOutput(newOutput);
      setCommand('');
    }
  };

  return (
    <div className="bg-black rounded-xl p-4 font-mono text-sm">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        <span className="text-gray-400 ml-2">Terminal</span>
      </div>
      <div className="text-green-400 max-h-64 overflow-y-auto space-y-1">
        {output.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
        <div className="flex items-center">
          <span className="text-blue-400">$ </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={handleCommand}
            className="bg-transparent text-green-400 outline-none flex-1 ml-1"
            placeholder="Enter command..."
          />
        </div>
      </div>
    </div>
  );
};

// Mock Graph Component - replace with your actual Graph component
const Graph = ({ nodes, orchestratorIP }) => {
  return (
    <div className="space-y-4">
      <div className="text-center p-6 bg-gray-50 rounded-xl">
        <Network className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Network Topology</h3>
        <p className="text-gray-600 mb-4">Orchestrator IP: {orchestratorIP}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nodes.map((node, index) => (
          <div
            key={node.id}
            className="p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                node.status.includes('running') ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{node.name}</h4>
                <p className="text-sm text-gray-600">{node.image}</p>
                <p className="text-xs text-gray-500">{node.ip}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Node = () => {
  // Get parameters from URL
  const roomId = window.location.pathname.split('/')[2];
  const nodeId = window.location.pathname.split('/')[4];
  
  const [room, setRoom] = useState(null);
  const [openModalChangeNode, setOpenModalChangeNode] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [orchestratorIP, setOrchestratorIP] = useState('');
  const [loading, setLoading] = useState(true);
  const [nodeStats, setNodeStats] = useState({
    cpu: 23,
    memory: 45,
    storage: 67,
    network: 12
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Simulate API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock orchestrator IP
        setOrchestratorIP('172.18.0.1');
        
        // Mock nodes data
        const mockNodes = [
          {
            id: "1a2b3c4d5e6f",
            name: "nginx-frontend",
            image: "nginx:alpine",
            status: "running (2 hours)",
            ip: "172.18.0.2",
            network: "bridge"
          },
          {
            id: "7g8h9i0j1k2l", 
            name: "redis-cache",
            image: "redis:latest",
            status: "running (3 hours)",
            ip: "172.18.0.3",
            network: "bridge"
          },
          {
            id: "m3n4o5p6q7r8",
            name: "postgres-db",
            image: "postgres:13",
            status: "running (1 day)",
            ip: "172.18.0.4",
            network: "bridge"
          }
        ];
        
        setNodes(mockNodes);
        
        // Generate links between nodes in same network
        const networkLinks = [];
        for (let i = 0; i < mockNodes.length; i++) {
          for (let j = i + 1; j < mockNodes.length; j++) {
            if (mockNodes[i].network === mockNodes[j].network) {
              networkLinks.push({ source: mockNodes[i].id, target: mockNodes[j].id });
            }
          }
        }
        setLinks(networkLinks);
        
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [roomId]);

  const refreshData = () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setLoading(false);
      setNodeStats({
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100),
        storage: Math.floor(Math.random() * 100),
        network: Math.floor(Math.random() * 50)
      });
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

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
                  {nodeId ? `${nodeId} Node` : 'Node Dashboard'}
                </h1>
                <p className="text-gray-600">Workspace: {roomId}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={refreshData}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all duration-200"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              
              <button
                onClick={() => setOpenModalChangeNode(true)}
                className="flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium"
              >
                <ArrowUpDown className="w-4 h-4" />
                <span>Change Node</span>
              </button>
            </div>
          </div>

          {/* Node Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-600">CPU Usage</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${nodeStats.cpu}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{nodeStats.cpu}%</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Activity className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-600">Memory</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${nodeStats.memory}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{nodeStats.memory}%</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <HardDrive className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-600">Storage</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${nodeStats.storage}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{nodeStats.storage}%</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Wifi className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-gray-600">Network</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${nodeStats.network}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">{nodeStats.network}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Terminal Section */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-8">
          <div className="flex items-center space-x-2 mb-6">
            <Terminal className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-medium text-gray-900">Terminal Access</h2>
          </div>
          <Cli />
        </div>

        {/* Container Status */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Container className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-medium text-gray-900">Container Status</h2>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              {nodes.filter(n => n.status.includes('running')).length} Running
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => (
              <div
                key={node.id}
                className="p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      node.status.includes('running') ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <h3 className="font-medium text-gray-900">{node.name}</h3>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    {node.status.includes('running') ? (
                      <button className="w-6 h-6 flex items-center justify-center text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Square className="w-3 h-3" />
                      </button>
                    ) : (
                      <button className="w-6 h-6 flex items-center justify-center text-green-600 hover:bg-green-50 rounded transition-colors">
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Container className="w-3 h-3" />
                    <span>{node.image}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Wifi className="w-3 h-3" />
                    <span>{node.ip}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Clock className="w-3 h-3" />
                    <span>{node.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Change Node Modal */}
      {openModalChangeNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setOpenModalChangeNode(false)}
          ></div>
          
          <div className="relative bg-white rounded-3xl shadow-xl max-w-2xl w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-gray-900">Network Topology</h2>
              <button
                onClick={() => setOpenModalChangeNode(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <Graph nodes={nodes} orchestratorIP={orchestratorIP} />
          </div>
        </div>
      )}
    </div>
  );
};