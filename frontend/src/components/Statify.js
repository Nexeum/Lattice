import React, { useState, useEffect } from "react";
import { 
  Container,
  Activity,
  Server,
  Wifi,
  WifiOff,
  Eye,
  Search,
  Filter,
  RefreshCw,
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink
} from "lucide-react";

const useContainers = () => {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchContainers = async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock data - replace with actual API call
      const mockContainers = [
        {
          ID: "a1b2c3d4e5f6",
          Names: "web-frontend",
          IP: "172.17.0.2",
          Port: "3000",
          Status: "running (2 hours)",
          Image: "nginx:alpine",
          Created: "2025-01-28T10:30:00Z"
        },
        {
          ID: "b2c3d4e5f6a1",
          Names: "api-backend",
          IP: "172.17.0.3", 
          Port: "8080",
          Status: "running (1 day)",
          Image: "node:18-alpine",
          Created: "2025-01-27T15:45:00Z"
        },
        {
          ID: "c3d4e5f6a1b2",
          Names: "database",
          IP: "172.17.0.4",
          Port: "5432",
          Status: "running (3 days)",
          Image: "postgres:15",
          Created: "2025-01-25T09:20:00Z"
        },
        {
          ID: "d4e5f6a1b2c3",
          Names: "redis-cache",
          IP: "172.17.0.5",
          Port: "6379",
          Status: "exited (1 hour ago)",
          Image: "redis:alpine",
          Created: "2025-01-28T08:15:00Z"
        },
        {
          ID: "e5f6a1b2c3d4",
          Names: "monitoring",
          IP: "172.17.0.6",
          Port: "9090",
          Status: "running (5 minutes)",
          Image: "prom/prometheus",
          Created: "2025-01-28T12:25:00Z"
        }
      ];
      
      setContainers(mockContainers);
    } catch (error) {
      console.error(error);
      setError("Error fetching containers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return { containers, fetchContainers, loading, error };
};

const getStatusInfo = (status) => {
  if (status.startsWith("running")) {
    return {
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      icon: CheckCircle,
      label: "Running"
    };
  } else if (status.startsWith("exited")) {
    return {
      color: "text-red-600", 
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      icon: AlertCircle,
      label: "Stopped"
    };
  } else {
    return {
      color: "text-gray-600",
      bgColor: "bg-gray-50", 
      borderColor: "border-gray-200",
      icon: Clock,
      label: "Unknown"
    };
  }
};

export const Statify = () => {
  const { containers, fetchContainers, loading, error } = useContainers();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchContainers();
  }, []);

  const filteredContainers = containers.filter(container => {
    const matchesSearch = 
      container.Names.toLowerCase().includes(searchTerm.toLowerCase()) ||
      container.IP.toLowerCase().includes(searchTerm.toLowerCase()) ||
      container.Port.toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === "all") return matchesSearch;
    if (statusFilter === "running") return matchesSearch && container.Status.startsWith("running");
    if (statusFilter === "stopped") return matchesSearch && container.Status.startsWith("exited");
    
    return matchesSearch;
  });

  const stats = {
    total: containers.length,
    running: containers.filter(c => c.Status.startsWith("running")).length,
    stopped: containers.filter(c => c.Status.startsWith("exited")).length,
    ports: containers.filter(c => c.Port && c.Port !== "N/A").length
  };

  const handleContainerAction = (containerId, action) => {
    console.log(`${action} container: ${containerId}`);
    // Add actual container management logic here
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Container Analytics</h1>
            <p className="text-gray-600">Monitor and manage your local containers</p>
          </div>
          <button
            onClick={fetchContainers}
            disabled={loading}
            className="group flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium shadow-sm hover:shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180'} transition-transform duration-300`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-light text-gray-900 mb-1">{stats.total}</p>
                <p className="text-sm text-gray-600 font-medium">Total Containers</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Container className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-light text-gray-900 mb-1">{stats.running}</p>
                <p className="text-sm text-gray-600 font-medium">Running</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-light text-gray-900 mb-1">{stats.stopped}</p>
                <p className="text-sm text-gray-600 font-medium">Stopped</p>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                <Square className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-light text-gray-900 mb-1">{stats.ports}</p>
                <p className="text-sm text-gray-600 font-medium">Exposed Ports</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                <Server className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Containers Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100">
          {/* Search and Filter Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h2 className="text-xl font-medium text-gray-900">Local Containers</h2>
              
              <div className="flex items-center space-x-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search containers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
                  />
                </div>
                
                {/* Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="running">Running</option>
                  <option value="stopped">Stopped</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
              </div>
            ) : filteredContainers.length > 0 ? (
              <div className="space-y-3">
                {filteredContainers.map((container) => {
                  const statusInfo = getStatusInfo(container.Status);
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <div
                      key={container.ID}
                      className="group p-6 border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                          {/* Container Info */}
                          <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-1">{container.Names}</h3>
                            <p className="text-sm text-gray-500">{container.Image}</p>
                          </div>
                          
                          {/* Network Info */}
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <Wifi className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900">{container.IP}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Server className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-600">Port {container.Port}</span>
                            </div>
                          </div>
                          
                          {/* Status */}
                          <div>
                            <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${statusInfo.bgColor} ${statusInfo.borderColor} border`}>
                              <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                              <span className={statusInfo.color}>{statusInfo.label}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{container.Status}</p>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center justify-end space-x-2">
                            {container.Port && container.Port !== "N/A" && container.Status.startsWith("running") && (
                              <button
                                onClick={() => console.log(`Navigate to container: ${container.ID}`)}
                                className="group/btn flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 text-sm font-medium"
                              >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                                <ExternalLink className="w-3 h-3 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                              </button>
                            )}
                            
                            {/* Additional action buttons */}
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {container.Status.startsWith("running") ? (
                                <button
                                  onClick={() => handleContainerAction(container.ID, "stop")}
                                  className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Stop container"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleContainerAction(container.ID, "start")}
                                  className="w-8 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Start container"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Container className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm || statusFilter !== 'all' ? "No containers found" : "No containers available"}
                </h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm || statusFilter !== 'all' 
                    ? "Try adjusting your search or filter criteria"
                    : "Start some containers to see them here"
                  }
                </p>
                {(!searchTerm && statusFilter === 'all') && (
                  <button
                    onClick={fetchContainers}
                    className="px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium"
                  >
                    Refresh Containers
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};