import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  Play,
  Book,
  Shield,
  Globe,
  ChevronDown,
  ChevronRight,
  Terminal,
  Key,
  ExternalLink,
  Server,
  Boxes,
  Package
} from 'lucide-react';

const AUTH_BASE_URL = 'http://localhost:5005';
const CONTAINERS_BASE_URL = 'http://localhost:5001';
const ROOMS_BASE_URL = 'http://localhost:5002';
const PACKAGES_BASE_URL = 'http://localhost:5003';

const SERVICES = [
  { name: 'Auth', baseUrl: AUTH_BASE_URL, description: 'Register, login, JWT sessions' },
  { name: 'Containers', baseUrl: CONTAINERS_BASE_URL, description: 'Docker containers, metrics, exec, topology' },
  { name: 'Rooms', baseUrl: ROOMS_BASE_URL, description: 'Workspaces (rooms) CRUD' },
  { name: 'Packages', baseUrl: PACKAGES_BASE_URL, description: 'Plugins/packages CRUD + file uploads' }
];

const ApiDocumentation = () => {
  const [copiedCode, setCopiedCode] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    auth: true,
    containers: true,
    rooms: false,
    packages: false
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
            method === 'GET' ? 'bg-green-100 text-green-800' :
            method === 'POST' ? 'bg-blue-100 text-blue-800' :
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

  const quickStartCode = `# 1. Register a user (auth service, port 5005)
curl -X POST ${AUTH_BASE_URL}/register \\
  -H "Content-Type: application/json" \\
  -d '{"email": "dev@example.com", "password": "secret"}'

# 2. Log in and grab the JWT (valid for 12 hours)
curl -X POST ${AUTH_BASE_URL}/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "dev@example.com", "password": "secret"}'
# => {"token": "eyJhbGciOi..."}
export TOKEN="eyJhbGciOi..."

# 3. List your local Docker containers (containers service, port 5001)
#    Every service except /register and /login now requires the token.
curl ${CONTAINERS_BASE_URL}/containers \\
  -H "Authorization: Bearer $TOKEN"`;

  const cliSetupCode = `# The CLI is a plain bash script that lives in the repo at bin/lattice.
# It needs curl and python3 (both ship with macOS). From the repo root:
export PATH="$PWD/bin:$PATH"

# ...or make it permanent with an alias in your shell profile:
alias lattice="/path/to/Lattice/bin/lattice"

lattice help`;

  const cliWorkflowCode = `# 1. Log in once — the token is cached in ~/.lattice/config (chmod 600)
#    Required: every other command talks to services that now check the JWT.
lattice login dev@example.com

# 2. Create a package for your plugin (prints the new package id)
lattice create my-plugin --version 1.0.0 --description "My first plugin"

# 3. Push: uploads every file in the current directory to the package
#    (hidden files, node_modules and the lattice script itself are skipped)
cd my-plugin/
lattice push <package_id>

# 4. Pick a target container and install the package into it
lattice containers
lattice install <package_id> <container_id>

# Nested (Docker-in-Docker) target? Pass the node and the child:
lattice install <package_id> <node_id> <child_id>

# 5. Verify — run a command inside the container (no URL-encoding needed,
#    the CLI handles it for you)
lattice exec <container_id> ls -la /opt/lattice/plugins`;

  const CLI_COMMANDS = [
    { command: 'lattice login <email>', description: 'Prompts for the password, logs in, caches the JWT in ~/.lattice/config' },
    { command: 'lattice register <email>', description: 'Creates a new user on the auth service' },
    { command: 'lattice packages', description: 'Lists packages: id, name, version, file count' },
    { command: 'lattice create <name> [--version X] [--description "..."]', description: 'Creates a package and prints its id' },
    { command: 'lattice push <package_id>', description: 'Uploads every regular file in the current directory to the package' },
    { command: 'lattice containers', description: 'Lists local Docker containers: short id, name, image, status' },
    { command: 'lattice install <package_id> <container_id>', description: 'Copies package files into /opt/lattice/plugins and runs install.sh if present' },
    { command: 'lattice install <package_id> <node_id> <child_id>', description: 'Same, but into a nested (DinD) container' },
    { command: 'lattice exec <container_id> <command...>', description: 'Runs a shell command inside a container (URL-encodes it for you)' },
    { command: 'lattice help', description: 'Shows usage' }
  ];

  const authExample = `# Log in to get a JWT (expires after 12 hours)
curl -X POST ${AUTH_BASE_URL}/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "dev@example.com", "password": "secret"}'
export TOKEN="eyJhbGciOi..."

# Use the token to fetch your user data
curl ${AUTH_BASE_URL}/userData \\
  -H "Authorization: Bearer $TOKEN"

# The same header is required by the other services:
curl ${CONTAINERS_BASE_URL}/containers \\
  -H "Authorization: Bearer $TOKEN"
curl ${ROOMS_BASE_URL}/rooms \\
  -H "Authorization: Bearer $TOKEN"
curl ${PACKAGES_BASE_URL}/packages \\
  -H "Authorization: Bearer $TOKEN"`;

  const execExample = `# Run "ls -la" inside container 1a2b3c4d5e6f.
# The command lives in the URL path, so it must be URL-encoded:
# spaces -> %20, slashes -> %2F, etc.
curl -X POST "${CONTAINERS_BASE_URL}/exe/1a2b3c4d5e6f/ls%20-la" \\
  -H "Authorization: Bearer $TOKEN"
# => {"output": "total 64\\ndrwxr-xr-x ..."}

# Same idea for a nested (Docker-in-Docker) container:
curl -X POST "${CONTAINERS_BASE_URL}/node/<outerId>/<innerId>/cat%20%2Fetc%2Fhostname" \\
  -H "Authorization: Bearer $TOKEN"`;

  const jsExample = `// Plain fetch against the local services — no SDK needed.
const AUTH_URL = '${AUTH_BASE_URL}';
const CONTAINERS_URL = '${CONTAINERS_BASE_URL}';

async function listContainersWithMetrics(email, password) {
  // 1. Log in — every service (except /register and /login) requires the JWT
  const loginRes = await fetch(\`\${AUTH_URL}/login\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!loginRes.ok) throw new Error(\`Login failed: \${loginRes.status}\`);
  const { token } = await loginRes.json();
  const auth = { Authorization: \`Bearer \${token}\` };

  // 2. Fetch user data with the Bearer token
  const userRes = await fetch(\`\${AUTH_URL}/userData\`, { headers: auth });
  const user = await userRes.json();

  // 3. List containers and pull live metrics for the first one
  //    (same Bearer token, now enforced by the containers service too)
  const containers = await (
    await fetch(\`\${CONTAINERS_URL}/containers\`, { headers: auth })
  ).json();
  if (containers.length > 0) {
    const metrics = await (
      await fetch(\`\${CONTAINERS_URL}/container/\${containers[0].ID}/metrics\`, {
        headers: auth
      })
    ).json();
    return { user, containers, metrics };
  }

  return { user, containers, metrics: null };
}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl mb-6 shadow-lg">
            <Code className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-5xl font-light text-gray-900 mb-4 tracking-tight">
            Lattice API
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Lattice runs four FastAPI services on your machine to orchestrate local Docker
            containers. Everything listens on localhost — no cloud, no keys, no setup.
          </p>

          {/* Quick stats */}
          <div className="flex items-center justify-center space-x-12 text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4" />
              <span>REST API</span>
            </div>
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4" />
              <span>Localhost Only</span>
            </div>
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>JWT Auth</span>
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
                  <a href="#cli" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    CLI
                  </a>
                  <a href="#authentication" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    Authentication
                  </a>
                  <a href="#endpoints" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    API Endpoints
                  </a>
                  <a href="#examples" className="block px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
                    Examples
                  </a>
                </nav>

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Swagger UI</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    Every service serves interactive OpenAPI docs at <code className="bg-gray-100 px-1 rounded">/docs</code>.
                  </p>
                  <div className="space-y-2">
                    {SERVICES.map((service) => (
                      <a
                        key={service.name}
                        href={`${service.baseUrl}/docs`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>{service.name} — {service.baseUrl.replace('http://', '')}/docs</span>
                      </a>
                    ))}
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
                  With the Lattice stack running, all four services are already listening on
                  localhost. Register a user, log in, and start talking to your containers.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Key className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">1. Register</h3>
                    <p className="text-sm text-gray-600">Create a user on the auth service (port 5005)</p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Terminal className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">2. Log In</h3>
                    <p className="text-sm text-gray-600">POST /login returns a JWT valid for 12 hours</p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Boxes className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">3. Explore</h3>
                    <p className="text-sm text-gray-600">List containers, stream metrics, exec commands</p>
                  </div>
                </div>

                <CodeBlock
                  code={quickStartCode}
                  language="bash"
                  id="quick-start-example"
                />

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
                  <div className="flex items-start space-x-3">
                    <Book className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Interactive docs included</p>
                      <p className="text-sm text-blue-800">
                        Each FastAPI service exposes Swagger UI at <code>/docs</code> — for example{' '}
                        <a href={`${CONTAINERS_BASE_URL}/docs`} target="_blank" rel="noopener noreferrer" className="underline">
                          {CONTAINERS_BASE_URL}/docs
                        </a>
                        . You can try every endpoint from the browser.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* CLI */}
            <section id="cli">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">CLI</h2>
                </div>

                <p className="text-gray-600 mb-6">
                  Prefer a CI/CD-style, command-driven workflow over clicking through the UI?
                  The repo ships a small bash CLI at{' '}
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">bin/lattice</code>{' '}
                  that wraps the same REST endpoints documented on this page: log in once,
                  create a package, push every file in your plugin directory, and install it
                  into any container — all from the terminal. Note that{' '}
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">lattice login</code>{' '}
                  is now required before any other command, since every service checks the token.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <Book className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Local script, not a published package</p>
                      <p className="text-sm text-blue-800">
                        There is nothing to install from npm or Homebrew — it is a plain bash
                        script in this repository. It only needs <code>curl</code> and{' '}
                        <code>python3</code>, and talks to the same localhost services
                        (auth :5005, containers :5001, packages :5003).
                      </p>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-3">Setup</h3>
                <div className="mb-6">
                  <CodeBlock
                    code={cliSetupCode}
                    language="bash"
                    id="cli-setup-example"
                  />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-3">Commands</h3>
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 overflow-hidden mb-6">
                  <div className="p-6 space-y-3">
                    {CLI_COMMANDS.map((entry) => (
                      <div key={entry.command} className="flex flex-col sm:flex-row sm:items-baseline sm:space-x-3 text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono whitespace-nowrap">{entry.command}</code>
                        <span className="text-gray-600 mt-1 sm:mt-0">{entry.description}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Full workflow: login → create → push → install
                </h3>
                <CodeBlock
                  code={cliWorkflowCode}
                  language="bash"
                  id="cli-workflow-example"
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
                  The auth service issues a JWT on login, valid for 12 hours. Send it as{' '}
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">Authorization: Bearer &lt;token&gt;</code>{' '}
                  on every request to every service.
                </p>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">All services now require the Bearer token</p>
                      <p className="text-sm text-amber-800">
                        The containers (5001), rooms (5002), and packages (5003) services enforce
                        JWT authentication on every endpoint, just like the auth service. The only
                        exceptions are <code>/register</code> and <code>/login</code>. Requests
                        without a valid token get a <code>401</code>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start space-x-3">
                    <Server className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Service base URLs</p>
                      <div className="text-sm text-blue-800 space-y-1 mt-1">
                        {SERVICES.map((service) => (
                          <div key={service.name}>
                            <code>{service.baseUrl}</code> — {service.description}
                          </div>
                        ))}
                      </div>
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
                  {/* Auth Section */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleSection('auth')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <h3 className="text-lg font-semibold text-gray-900">
                        Auth <span className="text-sm font-normal text-gray-500">— {AUTH_BASE_URL}</span>
                      </h3>
                      {expandedSections.auth ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                    </button>

                    {expandedSections.auth && (
                      <div className="p-4 space-y-4">
                        <EndpointCard
                          method="POST"
                          path="/register"
                          description="Create a new user account."
                          params={[
                            { name: 'email', type: 'string', description: 'User email (request body)' },
                            { name: 'password', type: 'string', description: 'User password (request body)' }
                          ]}
                          response={{ message: 'User registered successfully' }}
                        />

                        <EndpointCard
                          method="POST"
                          path="/login"
                          description="Authenticate and receive a JWT valid for 12 hours."
                          params={[
                            { name: 'email', type: 'string', description: 'User email (request body)' },
                            { name: 'password', type: 'string', description: 'User password (request body)' }
                          ]}
                          response={{ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }}
                        />

                        <EndpointCard
                          method="GET"
                          path="/userData"
                          description="Return the authenticated user's data. Requires the Authorization: Bearer <token> header."
                          response={{ email: 'dev@example.com' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Containers Section */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleSection('containers')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <h3 className="text-lg font-semibold text-gray-900">
                        Containers <span className="text-sm font-normal text-gray-500">— {CONTAINERS_BASE_URL}</span>
                      </h3>
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
                          description="List local Docker containers (docker ps output enriched with IP, port, and status)."
                          response={[
                            {
                              ID: '1a2b3c4d5e6f',
                              Names: 'nginx-frontend',
                              Image: 'nginx:alpine',
                              Status: 'Up 2 hours',
                              IP: '172.18.0.2',
                              Port: '8080'
                            }
                          ]}
                        />

                        <EndpointCard
                          method="GET"
                          path="/container/{id}/metrics"
                          description="Live resource usage for one container (docker stats)."
                          params={[
                            { name: 'id', type: 'string', description: 'Container ID or name' }
                          ]}
                          response={{
                            CPUPerc: '0.34%',
                            MemPerc: '1.20%',
                            MemUsage: '24.5MiB / 1.94GiB',
                            NetIO: '1.2kB / 800B',
                            BlockIO: '0B / 0B',
                            PIDs: '3'
                          }}
                        />

                        <EndpointCard
                          method="POST"
                          path="/exe/{id}/{command}"
                          description="Execute a shell command inside a container. The command goes in the URL path, so it must be URL-encoded (e.g. ls%20-la)."
                          params={[
                            { name: 'id', type: 'string', description: 'Container ID or name' },
                            { name: 'command', type: 'string', description: 'URL-encoded shell command' }
                          ]}
                          response={{ output: 'total 64\ndrwxr-xr-x 1 root root 4096 ...' }}
                        />

                        <EndpointCard
                          method="POST"
                          path="/node/{outerId}/{innerId}/{command}"
                          description="Execute a command inside a nested container (Docker-in-Docker): the inner container runs inside the outer node container."
                          params={[
                            { name: 'outerId', type: 'string', description: 'Node (outer) container ID' },
                            { name: 'innerId', type: 'string', description: 'Inner container ID' },
                            { name: 'command', type: 'string', description: 'URL-encoded shell command' }
                          ]}
                          response={{ output: 'inner-container-hostname' }}
                        />

                        <EndpointCard
                          method="GET"
                          path="/containers/{id}/ps"
                          description="Run docker ps inside a DinD node container to list its nested containers."
                          params={[
                            { name: 'id', type: 'string', description: 'Node container ID' }
                          ]}
                          response={[
                            { ID: 'abc123', Names: 'inner-app', Image: 'alpine', Status: 'Up 5 minutes' }
                          ]}
                        />

                        <EndpointCard
                          method="GET"
                          path="/system/health"
                          description="Host machine health: CPU, memory, and storage usage percentages."
                          response={{ cpu: 23.5, memory: 61.2, storage: 48.9 }}
                        />

                        <EndpointCard
                          method="GET"
                          path="/topology"
                          description="Docker networks and the containers attached to each of them."
                          response={{
                            networks: [
                              {
                                name: 'bridge',
                                containers: [
                                  { id: '1a2b3c4d5e6f', name: 'nginx-frontend', ip: '172.18.0.2' }
                                ]
                              }
                            ]
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
                      <h3 className="text-lg font-semibold text-gray-900">
                        Rooms <span className="text-sm font-normal text-gray-500">— {ROOMS_BASE_URL}</span>
                      </h3>
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
                          description="List all rooms (workspaces)."
                          response={[
                            { id: 'room-123', name: 'Development' }
                          ]}
                        />

                        <EndpointCard
                          method="POST"
                          path="/rooms"
                          description="Create a new room."
                          response={{ id: 'room-124', name: 'Staging' }}
                        />

                        <EndpointCard
                          method="GET"
                          path="/rooms/{id}"
                          description="Get a single room by ID."
                          params={[
                            { name: 'id', type: 'string', description: 'Room ID' }
                          ]}
                          response={{ id: 'room-123', name: 'Development' }}
                        />

                        <EndpointCard
                          method="PUT"
                          path="/rooms/{id}"
                          description="Update a room."
                          params={[
                            { name: 'id', type: 'string', description: 'Room ID' }
                          ]}
                          response={{ id: 'room-123', name: 'Development (renamed)' }}
                        />

                        <EndpointCard
                          method="DELETE"
                          path="/rooms/{id}"
                          description="Delete a room."
                          params={[
                            { name: 'id', type: 'string', description: 'Room ID' }
                          ]}
                          response={{ message: 'Room deleted' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Packages Section */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleSection('packages')}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <h3 className="text-lg font-semibold text-gray-900">
                        Packages <span className="text-sm font-normal text-gray-500">— {PACKAGES_BASE_URL}</span>
                      </h3>
                      {expandedSections.packages ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                    </button>

                    {expandedSections.packages && (
                      <div className="p-4 space-y-4">
                        <EndpointCard
                          method="GET"
                          path="/packages"
                          description="List all plugin packages."
                          response={[
                            { id: 'pkg-1', name: 'metrics-exporter' }
                          ]}
                        />

                        <EndpointCard
                          method="POST"
                          path="/packages"
                          description="Create a new package."
                          response={{ id: 'pkg-2', name: 'log-forwarder' }}
                        />

                        <EndpointCard
                          method="GET"
                          path="/packages/{id}"
                          description="Get a single package by ID."
                          params={[
                            { name: 'id', type: 'string', description: 'Package ID' }
                          ]}
                          response={{ id: 'pkg-1', name: 'metrics-exporter' }}
                        />

                        <EndpointCard
                          method="PUT"
                          path="/packages/{id}"
                          description="Update a package."
                          params={[
                            { name: 'id', type: 'string', description: 'Package ID' }
                          ]}
                          response={{ id: 'pkg-1', name: 'metrics-exporter-v2' }}
                        />

                        <EndpointCard
                          method="DELETE"
                          path="/packages/{id}"
                          description="Delete a package."
                          params={[
                            { name: 'id', type: 'string', description: 'Package ID' }
                          ]}
                          response={{ message: 'Package deleted' }}
                        />

                        <EndpointCard
                          method="POST"
                          path="/packages/{id}/files"
                          description="Upload a file to a package (multipart/form-data). Files are stored in GridFS."
                          params={[
                            { name: 'id', type: 'string', description: 'Package ID' },
                            { name: 'file', type: 'file', description: 'File to upload (multipart form field)' }
                          ]}
                          response={{ message: 'File uploaded', file_id: '65f1c2...' }}
                        />
                      </div>
                    )}
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Execute a Command in a Container</h3>
                    <CodeBlock
                      code={execExample}
                      language="bash"
                      id="exec-example"
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">JavaScript (fetch)</h3>
                    <CodeBlock
                      code={jsExample}
                      language="javascript"
                      id="js-example"
                    />
                  </div>

                  <div className="bg-gray-50 rounded-xl p-6">
                    <div className="flex items-start space-x-3">
                      <Package className="w-5 h-5 text-gray-500 mt-0.5" />
                      <p className="text-sm text-gray-600">
                        Prefer a UI? Every service ships Swagger UI at <code className="bg-gray-100 px-1 rounded">/docs</code>{' '}
                        (e.g. <code className="bg-gray-100 px-1 rounded">{CONTAINERS_BASE_URL}/docs</code>) where you can
                        inspect schemas and fire requests without writing any code.
                      </p>
                    </div>
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
