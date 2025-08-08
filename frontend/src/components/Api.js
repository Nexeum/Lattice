import React, { useState } from 'react';
import { 
  Code, 
  Copy, 
  Check, 
  Play, 
  Book, 
  Zap, 
  Shield, 
  Globe, 
  ChevronDown, 
  ChevronRight,
  Terminal,
  Key,
  ExternalLink,
  Download
} from 'lucide-react';

const ApiDocumentation = () => {
  const [copiedCode, setCopiedCode] = useState('');
  const [activeEndpoint, setActiveEndpoint] = useState('containers');
  const [expandedSections, setExpandedSections] = useState({
    authentication: true,
    containers: true,
    rooms: false,
    nodes: false
  });

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const CodeBlock = ({ code, language = 'bash', id }) => (
    <div className="relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="ml-3 text-sm text-gray-400 font-medium">{language}</span>
        </div>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center space-x-1 px-2 py-1 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
        >
          {copiedCode === id ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          <span className="text-xs">{copiedCode === id ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 text-sm text-gray-300 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );

  const EndpointCard = ({ method, path, description, params = [], response }) => (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 overflow-hidden">
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
            method === 'GET' ? 'bg-blue-100 text-blue-800' :
            method === 'POST' ? 'bg-green-100 text-green-800' :
            method === 'PUT' ? 'bg-orange-100 text-orange-800' :
            'bg-red-100 text-red-800'
          }`}>
            {method}
          </span>
          <code className="text-sm font-mono bg-gray-100 px-3 py-1 rounded-lg">{path}</code>
        </div>
        
        <p className="text-gray-600 mb-4">{description}</p>
        
        {params.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Parameters</h4>
            <div className="space-y-2">
              {params.map((param, idx) => (
                <div key={idx} className="flex items-center space-x-3 text-sm">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{param.name}</code>
                  <span className="text-gray-500">{param.type}</span>
                  <span className="text-gray-600">{param.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {response && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Response</h4>
            <CodeBlock 
              code={JSON.stringify(response, null, 2)} 
              language="json" 
              id={`response-${method}-${path.replace(/[^a-zA-Z0-9]/g, '')}`}
            />
          </div>
        )}
      </div>
    </div>
  );

  const quickStartCode = `# Install the Innoxus CLI
curl -fsSL https://get.innoxus.com | sh

# Authenticate with your API key
innoxus auth login --token YOUR_API_TOKEN

# Create your first container
innoxus containers create \\
  --name "my-app" \\
  --image "nginx:alpine" \\
  --port 80:8080

# List all containers
innoxus containers list`;

  const authExample = `curl -X POST https://api.innoxus.com/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@company.com",
    "password": "your-password"
  }'`;

  const containerExample = `curl -X GET https://api.innoxus.com/v1/containers \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json"`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl mb-6 shadow-lg">
            <Code className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-5xl font-light text-gray-900 mb-4 tracking-tight">
            Innoxus API
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Build powerful container orchestration solutions with our comprehensive REST API. 
            Simple, secure, and scalable.
          </p>
          
          {/* Quick stats */}
          <div className="flex items-center justify-center space-x-12 text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4" />
              <span>REST API</span>
            </div>
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>OAuth 2.0</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>Rate Limited</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentation</h3>
                
                <nav className="space-y-2">
                  <a href="#quick-start" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    Quick Start
                  </a>
                  <a href="#authentication" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    Authentication
                  </a>
                  <a href="#endpoints" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    API Endpoints
                  </a>
                  <a href="#sdks" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    SDKs & Tools
                  </a>
                  <a href="#examples" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    Examples
                  </a>
                </nav>

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Resources</h4>
                  <div className="space-y-2">
                    <a href="#" className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                      <Download className="w-4 h-4" />
                      <span>OpenAPI Spec</span>
                    </a>
                    <a href="#" className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                      <span>Postman Collection</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-12">
            {/* Quick Start */}
            <section id="quick-start">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Quick Start</h2>
                </div>
                
                <p className="text-gray-600 mb-6">
                  Get started with the Innoxus API in minutes. Follow these steps to make your first API call.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Key className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">1. Get API Key</h3>
                    <p className="text-sm text-gray-600">Create an account and generate your API token</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Terminal className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">2. Install CLI</h3>
                    <p className="text-sm text-gray-600">Use our CLI or make direct HTTP requests</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Play className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">3. Deploy</h3>
                    <p className="text-sm text-gray-600">Create and manage your containers</p>
                  </div>
                </div>

                <CodeBlock 
                  code={quickStartCode} 
                  language="bash" 
                  id="quick-start-example" 
                />
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Authentication</h2>
                </div>

                <p className="text-gray-600 mb-6">
                  The Innoxus API uses Bearer token authentication. Include your API token in the Authorization header.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Base URL</p>
                      <code className="text-sm text-blue-800">https://api.innoxus.com/v1</code>
                    </div>
                  </div>
                </div>

                <CodeBlock 
                  code={authExample} 
                  language="bash" 
                  id="auth-example" 
                />
              </div>
            </section>

            {/* API Endpoints */}
            <section id="endpoints">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Book className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">API Endpoints</h2>
                </div>

                <div className="space-y-6">
                  {/* Containers Section */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleSection('containers')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <h3 className="text-lg font-semibold text-gray-900">Containers</h3>
                      {expandedSections.containers ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                    </button>
                    
                    {expandedSections.containers && (
                      <div className="p-4 space-y-4">
                        <EndpointCard
                          method="GET"
                          path="/containers"
                          description="List all containers in your account"
                          response={{
                            "containers": [
                              {
                                "id": "1a2b3c4d5e6f",
                                "name": "nginx-frontend",
                                "image": "nginx:alpine",
                                "status": "running",
                                "ip": "172.18.0.2",
                                "created_at": "2024-01-15T10:30:00Z"
                              }
                            ],
                            "total": 1
                          }}
                        />
                        
                        <EndpointCard
                          method="POST"
                          path="/containers"
                          description="Create a new container"
                          params={[
                            { name: "name", type: "string", description: "Container name" },
                            { name: "image", type: "string", description: "Docker image" },
                            { name: "shell", type: "string", description: "Default shell (optional)" }
                          ]}
                          response={{
                            "id": "new-container-id",
                            "name": "my-app",
                            "image": "nginx:alpine",
                            "status": "creating",
                            "ip": "172.18.0.5"
                          }}
                        />

                        <EndpointCard
                          method="DELETE"
                          path="/containers/{id}"
                          description="Delete a specific container"
                          params={[
                            { name: "id", type: "string", description: "Container ID" }
                          ]}
                          response={{
                            "message": "Container deleted successfully",
                            "id": "1a2b3c4d5e6f"
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Rooms Section */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleSection('rooms')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <h3 className="text-lg font-semibold text-gray-900">Rooms (Orchestrators)</h3>
                      {expandedSections.rooms ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                    </button>
                    
                    {expandedSections.rooms && (
                      <div className="p-4 space-y-4">
                        <EndpointCard
                          method="GET"
                          path="/rooms"
                          description="List all orchestrator rooms"
                          response={{
                            "rooms": [
                              {
                                "id": "room-123",
                                "name": "Development Team",
                                "orchestrator_ip": "172.18.0.1",
                                "containers_count": 3,
                                "status": "active"
                              }
                            ]
                          }}
                        />
                        
                        <EndpointCard
                          method="GET"
                          path="/rooms/{id}/topology"
                          description="Get network topology for a room"
                          response={{
                            "orchestrator": {
                              "id": "orchestrator",
                              "ip": "172.18.0.1"
                            },
                            "nodes": [
                              {
                                "id": "container-1",
                                "name": "nginx-frontend",
                                "ip": "172.18.0.2",
                                "status": "active"
                              }
                            ]
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* SDKs and Tools */}
            <section id="sdks">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <Code className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">SDKs & Tools</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Official SDKs</h3>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• JavaScript/Node.js SDK</li>
                      <li>• Python SDK</li>
                      <li>• Go SDK</li>
                      <li>• CLI Tool</li>
                    </ul>
                  </div>
                  
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Community Tools</h3>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• Terraform Provider</li>
                      <li>• GitHub Actions</li>
                      <li>• Kubernetes Operator</li>
                      <li>• Docker Compose Plugin</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Examples */}
            <section id="examples">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Code Examples</h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">List Containers</h3>
                    <CodeBlock 
                      code={containerExample} 
                      language="bash" 
                      id="container-list-example" 
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">JavaScript Example</h3>
                    <CodeBlock 
                      code={`const innoxus = require('@innoxus/sdk');

const client = new innoxus.Client({
  token: 'your-api-token'
});

// Create a new container
const container = await client.containers.create({
  name: 'my-web-app',
  image: 'nginx:alpine',
  ports: [{ host: 8080, container: 80 }]
});

console.log('Container created:', container.id);`} 
                      language="javascript" 
                      id="js-example" 
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDocumentation;