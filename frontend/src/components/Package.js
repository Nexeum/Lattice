import React, { useState, useEffect } from "react";
import { 
  Star, 
  Download, 
  Code, 
  FileText, 
  Folder,
  Copy,
  ExternalLink,
  Terminal,
  GitBranch,
  Shield,
  Users,
  Calendar,
  Package as PackageIcon
} from "lucide-react";

export const Package = () => {
  const [packageData, setPackageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Get ID from URL
  const id = window.location.pathname.split('/').pop();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data based on ID
        const mockPackage = {
          _id: id,
          name: id === "1" ? "redis-connector" : id === "2" ? "nginx-lb" : "auth-middleware",
          description: id === "1" 
            ? "Redis database connector plugin for seamless caching integration with automatic failover and connection pooling"
            : id === "2" 
            ? "Nginx load balancer plugin with auto-scaling, health checks, and SSL termination"
            : "JWT authentication middleware plugin for secure API endpoints with role-based access control",
          stars: id === "1" ? 142 : id === "2" ? 87 : 256,
          downloads: id === "1" ? 5420 : id === "2" ? 3210 : 8750,
          version: "2.1.4",
          author: "Innoxus Team",
          license: "MIT",
          created_at: "2024-01-15",
          updated_at: "2024-01-28",
          language: id === "1" ? "Python" : id === "2" ? "Nginx Config" : "Node.js",
          size: "2.4 MB",
          files: id === "1" ? [
            { name: "README.md", type: "file", size: "4.2 KB" },
            { name: "setup.py", type: "file", size: "1.8 KB" },
            { name: "redis_connector/", type: "folder", size: "-" },
            { name: "redis_connector/__init__.py", type: "file", size: "856 B" },
            { name: "redis_connector/client.py", type: "file", size: "12.4 KB" },
            { name: "redis_connector/config.py", type: "file", size: "3.2 KB" },
            { name: "tests/", type: "folder", size: "-" },
            { name: "requirements.txt", type: "file", size: "234 B" },
            { name: "LICENSE", type: "file", size: "1.1 KB" }
          ] : [],
          installation: {
            docker: `docker run -d --name redis-connector \\
  -e REDIS_HOST=redis-server \\
  -e REDIS_PORT=6379 \\
  innoxus/${id === "1" ? "redis-connector" : id === "2" ? "nginx-lb" : "auth-middleware"}:latest`,
            compose: `version: '3.8'
services:
  ${id === "1" ? "redis-connector" : id === "2" ? "nginx-lb" : "auth-middleware"}:
    image: innoxus/${id === "1" ? "redis-connector" : id === "2" ? "nginx-lb" : "auth-middleware"}:latest
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production`,
            kubernetes: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${id === "1" ? "redis-connector" : id === "2" ? "nginx-lb" : "auth-middleware"}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${id === "1" ? "redis-connector" : id === "2" ? "nginx-lb" : "auth-middleware"}`
          },
          dependencies: [
            "redis>=4.0.0",
            "pydantic>=1.8.0", 
            "fastapi>=0.68.0",
            "uvicorn>=0.15.0"
          ],
          tags: ["database", "redis", "cache", "connector", "plugin"]
        };
        
        setPackageData(mockPackage);
      } catch (error) {
        console.error("Error fetching package:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
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

  if (!packageData) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-20">
            <PackageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Plugin not found</h3>
            <p className="text-gray-600">The requested plugin could not be found.</p>
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
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between space-y-6 lg:space-y-0">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <PackageIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-light text-gray-900">{packageData.name}</h1>
                  <p className="text-gray-600">v{packageData.version} • by {packageData.author}</p>
                </div>
              </div>
              
              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                {packageData.description}
              </p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {packageData.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium text-gray-600">Stars</span>
                  </div>
                  <p className="text-2xl font-light text-gray-900">{packageData.stars}</p>
                </div>
                
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Download className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-gray-600">Downloads</span>
                  </div>
                  <p className="text-2xl font-light text-gray-900">{packageData.downloads.toLocaleString()}</p>
                </div>
                
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Code className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-gray-600">Language</span>
                  </div>
                  <p className="text-lg font-medium text-gray-900">{packageData.language}</p>
                </div>
                
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-gray-600">License</span>
                  </div>
                  <p className="text-lg font-medium text-gray-900">{packageData.license}</p>
                </div>
              </div>
            </div>
            
            <div className="lg:ml-8">
              <button className="w-full lg:w-auto flex items-center justify-center space-x-2 px-8 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium mb-4">
                <Download className="w-4 h-4" />
                <span>Install Plugin</span>
              </button>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>Updated {packageData.updated_at}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <PackageIcon className="w-4 h-4" />
                  <span>Size: {packageData.size}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100">
          <div className="border-b border-gray-100">
            <nav className="flex space-x-8 px-8 pt-6">
              {[
                { id: "overview", label: "Overview" },
                { id: "installation", label: "Installation" },
                { id: "files", label: "Files" },
                { id: "dependencies", label: "Dependencies" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-black text-gray-900"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-8">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="prose max-w-none">
                <h3 className="text-xl font-medium text-gray-900 mb-4">About this plugin</h3>
                <p className="text-gray-700 leading-relaxed mb-6">
                  This plugin provides seamless integration with Redis for caching and session management in containerized applications. 
                  It features automatic connection pooling, failover handling, and performance monitoring.
                </p>
                
                <h4 className="text-lg font-medium text-gray-900 mb-3">Key Features</h4>
                <ul className="space-y-2 text-gray-700">
                  <li>• Automatic connection pooling and management</li>
                  <li>• Built-in failover and retry mechanisms</li>
                  <li>• Real-time performance monitoring</li>
                  <li>• Easy configuration via environment variables</li>
                  <li>• Support for Redis Cluster and Sentinel</li>
                </ul>
                
                <h4 className="text-lg font-medium text-gray-900 mb-3 mt-6">Requirements</h4>
                <div className="bg-gray-50 rounded-xl p-4">
                  <ul className="space-y-1 text-sm text-gray-700">
                    <li>• Docker Engine 20.0+</li>
                    <li>• Redis Server 6.0+</li>
                    <li>• Minimum 512MB RAM</li>
                    <li>• Network connectivity to Redis instance</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Installation Tab */}
            {activeTab === "installation" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-medium text-gray-900 mb-4">Installation Instructions</h3>
                  <p className="text-gray-600 mb-6">Choose your preferred installation method:</p>
                </div>

                {/* Docker */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center space-x-2">
                    <Terminal className="w-5 h-5" />
                    <span>Docker</span>
                  </h4>
                  <div className="bg-gray-900 rounded-xl p-4 relative">
                    <button
                      onClick={() => copyToClipboard(packageData.installation.docker)}
                      className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <pre className="text-sm text-gray-100 overflow-x-auto">
                      <code>{packageData.installation.docker}</code>
                    </pre>
                  </div>
                </div>

                {/* Docker Compose */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-3">Docker Compose</h4>
                  <div className="bg-gray-900 rounded-xl p-4 relative">
                    <button
                      onClick={() => copyToClipboard(packageData.installation.compose)}
                      className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <pre className="text-sm text-gray-100 overflow-x-auto">
                      <code>{packageData.installation.compose}</code>
                    </pre>
                  </div>
                </div>

                {/* Kubernetes */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-3">Kubernetes</h4>
                  <div className="bg-gray-900 rounded-xl p-4 relative">
                    <button
                      onClick={() => copyToClipboard(packageData.installation.kubernetes)}
                      className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <pre className="text-sm text-gray-100 overflow-x-auto">
                      <code>{packageData.installation.kubernetes}</code>
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Files Tab */}
            {activeTab === "files" && (
              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-4">Plugin Files</h3>
                {packageData.files.length > 0 ? (
                  <div className="space-y-2">
                    {packageData.files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        {file.type === "folder" ? (
                          <Folder className="w-5 h-5 text-blue-500" />
                        ) : (
                          <FileText className="w-5 h-5 text-gray-500" />
                        )}
                        <span className="flex-1 text-gray-900 font-medium">{file.name}</span>
                        <span className="text-sm text-gray-500">{file.size}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No files available</h4>
                    <p className="text-gray-600 mb-6">This plugin doesn't expose its file structure.</p>
                  </div>
                )}
              </div>
            )}

            {/* Dependencies Tab */}
            {activeTab === "dependencies" && (
              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-4">Dependencies</h3>
                <div className="space-y-3">
                  {packageData.dependencies.map((dep, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center space-x-3">
                        <PackageIcon className="w-5 h-5 text-gray-500" />
                        <span className="font-mono text-gray-900">{dep}</span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};