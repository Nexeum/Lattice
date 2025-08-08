import React, { useEffect, useState } from 'react';
import { Cli } from './Cli';
import { Graph } from './Graph';
import { Server, Play, Plus, Loader, Container, Activity, Network, Terminal , X} from 'lucide-react';

export const Room = () => {
  // Get ID from URL parameters
  const id = window.location.pathname.split('/')[2] || 'demo';
  
  const [room, setRoom] = useState(null);
  const [openModalCreate, setOpenModalCreate] = useState(false);
  const [openModalChangeNode, setOpenModalChangeNode] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [containerImage, setContainerImage] = useState('');
  const [containerShell, setContainerShell] = useState('');
  const [creationResult, setCreationResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [orchestratorIP, setOrchestratorIP] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Simulate API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock room data
        setRoom({
          name: "Development Team",
          id: id,
          description: "Main development environment for container orchestration"
        });
        
        // Mock orchestrator IP
        setOrchestratorIP('172.18.0.1');
        
        // Mock nodes data
        const mockNodes = [
          {
            id: "1a2b3c4d5e6f",
            name: "nginx-frontend",
            image: "nginx:alpine",
            status: "active",
            ip: "172.18.0.2",
            network: "bridge"
          },
          {
            id: "7g8h9i0j1k2l", 
            name: "redis-cache",
            image: "redis:latest",
            status: "active",
            ip: "172.18.0.3",
            network: "bridge"
          },
          {
            id: "m3n4o5p6q7r8",
            name: "postgres-db",
            image: "postgres:13",
            status: "active",
            ip: "172.18.0.4",
            network: "bridge"
          },
          {
            id: "n4o5p6q7r8s9",
            name: "api-gateway",
            image: "node:18-alpine",
            status: "active",
            ip: "172.18.0.5",
            network: "bridge"
          }
        ];
        
        setNodes(mockNodes);
        
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const createContainer = async () => {
    if (!containerName.trim() || !containerImage.trim()) {
      setCreationResult("Error: Container name and image are required");
      return;
    }

    setCreating(true);
    setCreationResult('Creating container...');
    
    try {
      // Simulate container creation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newContainer = {
        id: Date.now().toString(),
        name: containerName,
        image: containerImage,
        status: "active",
        ip: `172.18.0.${nodes.length + 10}`,
        network: "bridge"
      };
      
      setNodes(prev => [...prev, newContainer]);
      setCreationResult(`✅ Container "${containerName}" created successfully!\nContainer ID: ${newContainer.id}\nIP Address: ${newContainer.ip}`);
      
      // Clear form after successful creation
      setTimeout(() => {
        setContainerName('');
        setContainerImage('');
        setContainerShell('');
        setCreationResult('');
      }, 3000);
      
    } catch (error) {
      setCreationResult(`❌ Failed to create container: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-gray-400 rounded-full animate-spin animate-reverse" style={{animationDelay: '0.15s'}}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Server className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-light text-gray-900 tracking-tight">
                  {room ? `${room.name}` : 'Loading...'}
                </h1>
                <p className="text-gray-500 font-medium">Container Orchestration Platform</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setOpenModalChangeNode(true)}
                className="flex items-center space-x-2 px-5 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-2xl transition-all duration-300 backdrop-blur-sm border border-gray-200/50"
              >
                <Network className="w-4 h-4" />
                <span className="font-medium">Network View</span>
              </button>
              
              <button
                onClick={() => setOpenModalCreate(true)}
                className="flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 hover:shadow-lg transition-all duration-300 font-medium shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Create Container</span>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl p-5 border border-blue-200/30">
              <div className="flex items-center space-x-2 mb-3">
                <Container className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Total Containers</span>
              </div>
              <p className="text-3xl font-light text-blue-900">{nodes.length}</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-2xl p-5 border border-green-200/30">
              <div className="flex items-center space-x-2 mb-3">
                <Activity className="w-5 h-5 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Active</span>
              </div>
              <p className="text-3xl font-light text-green-900">
                {nodes.filter(n => n.status === 'active').length}
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-5 border border-purple-200/30">
              <div className="flex items-center space-x-2 mb-3">
                <Network className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-semibold text-purple-800">Orchestrator</span>
              </div>
              <p className="text-lg font-medium text-purple-900 font-mono">{orchestratorIP}</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-2xl p-5 border border-orange-200/30">
              <div className="flex items-center space-x-2 mb-3">
                <Terminal className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-semibold text-orange-800">Network</span>
              </div>
              <p className="text-lg font-medium text-orange-900">bridge</p>
            </div>
          </div>
        </div>

        {/* Terminal Section */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/20 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Container Terminal</h2>
          </div>
          <Cli />
        </div>
      </div>

      {/* Create Container Modal */}
      {openModalCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => setOpenModalCreate(false)}
          ></div>
          
          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full p-8 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Create Container</h2>
              <button
                onClick={() => setOpenModalCreate(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="containerName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Container Name
                </label>
                <input
                  id="containerName"
                  type="text"
                  value={containerName}
                  onChange={(e) => setContainerName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 backdrop-blur-sm"
                  placeholder="my-awesome-app"
                />
              </div>

              <div>
                <label htmlFor="containerImage" className="block text-sm font-semibold text-gray-700 mb-2">
                  Container Image
                </label>
                <input
                  id="containerImage"
                  type="text"
                  value={containerImage}
                  onChange={(e) => setContainerImage(e.target.value)}
                  className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 backdrop-blur-sm"
                  placeholder="nginx:alpine"
                />
              </div>

              <div>
                <label htmlFor="containerShell" className="block text-sm font-semibold text-gray-700 mb-2">
                  Shell (Optional)
                </label>
                <input
                  id="containerShell"
                  type="text"
                  value={containerShell}
                  onChange={(e) => setContainerShell(e.target.value)}
                  className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/20 focus:border-black/50 outline-none transition-all duration-200 backdrop-blur-sm"
                  placeholder="/bin/bash"
                />
              </div>

              {/* Creation Result */}
              {creationResult && (
                <div className="p-4 bg-gray-50/80 backdrop-blur-sm rounded-2xl border border-gray-200/50">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                    {creationResult}
                  </pre>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={createContainer}
                  disabled={creating || !containerName.trim() || !containerImage.trim()}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-2xl hover:bg-gray-800 hover:shadow-lg focus:ring-2 focus:ring-black/20 focus:ring-offset-2 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md"
                >
                  {creating ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Create Container
                    </>
                  )}
                </button>
                <button
                  onClick={() => setOpenModalCreate(false)}
                  className="px-6 py-3 bg-white/50 border border-gray-200 text-gray-700 rounded-2xl hover:bg-white transition-all duration-200 font-semibold backdrop-blur-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Network Topology Modal - FIXED DIMENSIONS */}
      {openModalChangeNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => setOpenModalChangeNode(false)}
          ></div>
          
          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-6xl h-[80vh] border border-white/20 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50 bg-white/50 backdrop-blur-sm">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Network className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900">Network Topology</h2>
              </div>
              <button
                onClick={() => setOpenModalChangeNode(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 rounded-xl transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Graph Container - FIXED HEIGHT */}
            <div className="w-full h-[calc(80vh-88px)] p-6">
              <div className="w-full h-full rounded-2xl overflow-hidden">
                <Graph nodes={nodes} orchestratorIP={orchestratorIP} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};