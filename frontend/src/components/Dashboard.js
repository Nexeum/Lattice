import React, { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { 
  Plus, 
  Package, 
  Star, 
  Code, 
  Calendar, 
  TrendingUp, 
  Users, 
  Activity,
  X,
  Search,
  Filter,
  ArrowRight
} from "lucide-react";

export const Dashboard = () => {
  const history = useHistory();
  const [openModal, setOpenModal] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [description, setDescription] = useState("");
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState("all");

  // Mock data for demonstration - replace with actual API calls
  useEffect(() => {
    const fetchPackages = async () => {
      setLoading(true);
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data - replace with actual API call
        const mockPackages = [
          {
            _id: "1",
            name: "redis-connector",
            description: "Redis database connector plugin for seamless caching integration",
            language: "Python",
            stars: 42,
            created_at: "2024-01-15",
            containers: 3,
            status: "active",
            type: "Database Plugin"
          },
          {
            _id: "2", 
            name: "nginx-lb",
            description: "Nginx load balancer plugin with auto-scaling and health checks",
            language: "Nginx Config",
            stars: 87,
            created_at: "2024-01-10",
            containers: 8,
            status: "active",
            type: "Load Balancer"
          },
          {
            _id: "3",
            name: "log-aggregator",
            description: "Centralized logging plugin for container log collection and analysis",
            language: "Go",
            stars: 23,
            created_at: "2024-01-05",
            containers: 2,
            status: "stopped",
            type: "Monitoring Plugin"
          },
          {
            _id: "4",
            name: "auth-middleware",
            description: "JWT authentication middleware plugin for secure API endpoints",
            language: "Node.js",
            stars: 156,
            created_at: "2024-01-20",
            containers: 12,
            status: "active",
            type: "Security Plugin"
          }
        ];
        
        setPackages(mockPackages);
      } catch (error) {
        console.error("Error fetching packages:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newPackage = {
        _id: Date.now().toString(),
        name: packageName,
        description: description,
        language: "Not Recognized",
        stars: 0,
        created_at: new Date().toISOString().split('T')[0],
        containers: 0,
        status: "inactive",
        type: "Custom Plugin"
      };
      
      setPackages(prev => [newPackage, ...prev]);
      setOpenModal(false);
      setPackageName("");
      setDescription("");
      
      // Navigate to package detail page
      history.push(`/package/${newPackage._id}`);
    } catch (error) {
      console.error("Error creating package:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePackageClick = (packageId) => {
    history.push(`/package/${packageId}`);
  };

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch = pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pkg.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterActive === "all") return matchesSearch;
    if (filterActive === "active") return matchesSearch && pkg.status === "active";
    if (filterActive === "stopped") return matchesSearch && pkg.status === "stopped";
    
    return matchesSearch;
  });

  const stats = [
    {
      label: "Total Plugins",
      value: packages.length,
      icon: Package,
      color: "blue"
    },
    {
      label: "Active Containers",
      value: packages.reduce((sum, pkg) => sum + pkg.containers, 0),
      icon: Activity,
      color: "green"
    },
    {
      label: "Total Stars",
      value: packages.reduce((sum, pkg) => sum + pkg.stars, 0),
      icon: Star,
      color: "yellow"
    },
    {
      label: "Contributors",
      value: 12,
      icon: Users,
      color: "purple"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-light text-gray-900 mb-2">Container Plugins</h1>
              <p className="text-gray-600">Manage and install plugins for your containers</p>
            </div>
            <button
              onClick={() => setOpenModal(true)}
              className="group flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Create Plugin</span>
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-light text-gray-900 mb-1">{stat.value}</p>
                    <p className="text-sm text-gray-600 font-medium">{stat.label}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    stat.color === 'blue' ? 'bg-blue-50' :
                    stat.color === 'green' ? 'bg-green-50' :
                    stat.color === 'yellow' ? 'bg-yellow-50' :
                    'bg-purple-50'
                  }`}>
                    <stat.icon className={`w-6 h-6 ${
                      stat.color === 'blue' ? 'text-blue-600' :
                      stat.color === 'green' ? 'text-green-600' :
                      stat.color === 'yellow' ? 'text-yellow-600' :
                      'text-purple-600'
                    }`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Packages Section */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100">
          {/* Search and Filter Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <h2 className="text-xl font-medium text-gray-900">Available Plugins</h2>
              
              <div className="flex items-center space-x-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search plugins..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
                  />
                </div>
                
                {/* Filter */}
                <select
                  value={filterActive}
                  onChange={(e) => setFilterActive(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="stopped">Stopped</option>
                </select>
              </div>
            </div>
          </div>

          {/* Packages List */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
              </div>
            ) : filteredPackages.length > 0 ? (
              <div className="space-y-4">
                {filteredPackages.map((pkg) => (
                  <div
                    key={pkg._id}
                    onClick={() => handlePackageClick(pkg._id)}
                    className="group p-6 border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900 group-hover:text-black">
                            {pkg.name}
                          </h3>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            {pkg.type}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            pkg.status === 'active' 
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {pkg.status}
                          </span>
                        </div>
                        
                        <p className="text-gray-600 mb-3 leading-relaxed">
                          {pkg.description}
                        </p>
                        
                        <div className="flex items-center space-x-6 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Code className="w-4 h-4" />
                            <span>{pkg.language}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4" />
                            <span>{pkg.stars}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Activity className="w-4 h-4" />
                            <span>{pkg.containers} installations</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4" />
                            <span>{pkg.created_at}</span>
                          </div>
                        </div>
                      </div>
                      
                      <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No plugins found</h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm || filterActive !== 'all' 
                    ? "Try adjusting your search or filter criteria"
                    : "Get started by creating your first plugin"
                  }
                </p>
                {(!searchTerm && filterActive === 'all') && (
                  <button
                    onClick={() => setOpenModal(true)}
                    className="px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium"
                  >
                    Create Plugin
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setOpenModal(false)}
          ></div>
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-gray-900">Create Plugin</h2>
              <button
                onClick={() => setOpenModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-6">
              <div>
                <label htmlFor="packageName" className="block text-sm font-medium text-gray-700 mb-2">
                  Plugin Name
                </label>
                <input
                  id="packageName"
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                  placeholder="my-awesome-plugin"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  rows="3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 resize-none"
                  placeholder="Describe what your plugin does for containers..."
                />
              </div>

              {/* Actions */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSubmit}
                  disabled={!packageName.trim() || !description.trim() || loading}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    "Create Plugin"
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
    </div>
  );
};