import React, { useState, useEffect, useCallback } from "react";
import { useHistory } from "react-router-dom";
import {
  Plus,
  Package,
  Code,
  Tag,
  Activity,
  StopCircle,
  Network,
  AlertTriangle,
  X,
  Search,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import { toast } from "../lib/toast";

const PACKAGES_API = "http://localhost:5003";
const ENGINE_API = "http://localhost:5001";
const MAX_VISIBLE_TAGS = 4;

export const Dashboard = () => {
  const history = useHistory();
  const [openModal, setOpenModal] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState(null);

  const [containers, setContainers] = useState([]);
  const [containersLoading, setContainersLoading] = useState(true);
  const [containersError, setContainersError] = useState(null);

  const [networks, setNetworks] = useState([]);
  const [networksLoading, setNetworksLoading] = useState(true);
  const [networksError, setNetworksError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");

  // App Catalog: hidden entirely when the backend endpoint is missing/erroring.
  const [catalogItems, setCatalogItems] = useState([]);
  const [installedKeys, setInstalledKeys] = useState({});
  const [installingKey, setInstallingKey] = useState(null);
  // null = "no explicit choice yet" — default derives from the plugin count.
  const [catalogToggle, setCatalogToggle] = useState(null);

  const fetchPackages = useCallback(async () => {
    setPackagesLoading(true);
    setPackagesError(null);
    try {
      const response = await fetch(`${PACKAGES_API}/packages`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Packages request failed (${response.status})`);
      }
      const data = await response.json();
      setPackages(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching packages:", error);
      setPackagesError("Could not load plugins. Is the package service running on port 5003?");
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  const fetchContainers = useCallback(async () => {
    setContainersLoading(true);
    setContainersError(null);
    try {
      const response = await fetch(`${ENGINE_API}/containers`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Containers request failed (${response.status})`);
      }
      const data = await response.json();
      setContainers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching containers:", error);
      setContainersError("Could not load containers.");
    } finally {
      setContainersLoading(false);
    }
  }, []);

  const fetchTopology = useCallback(async () => {
    setNetworksLoading(true);
    setNetworksError(null);
    try {
      const response = await fetch(`${ENGINE_API}/topology`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Topology request failed (${response.status})`);
      }
      const data = await response.json();
      setNetworks(data && Array.isArray(data.networks) ? data.networks : []);
    } catch (error) {
      console.error("Error fetching topology:", error);
      setNetworksError("Could not load networks.");
    } finally {
      setNetworksLoading(false);
    }
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const response = await fetch(`${PACKAGES_API}/catalog`, {
        headers: { ...authHeaders() }
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        // Endpoint not deployed yet (404) or failing: hide the section.
        setCatalogItems([]);
        return;
      }
      const data = await response.json();
      setCatalogItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching catalog:", error);
      setCatalogItems([]);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
    fetchContainers();
    fetchTopology();
    fetchCatalog();
  }, [fetchPackages, fetchContainers, fetchTopology, fetchCatalog]);

  const handleInstall = async (item) => {
    if (installingKey) return;
    setInstallingKey(item.key);
    try {
      const response = await fetch(
        `${PACKAGES_API}/catalog/${encodeURIComponent(item.key)}/install`,
        { method: "POST", headers: { ...authHeaders() } }
      );
      if (redirectIfUnauthorized(response)) return;
      if (response.status === 409) {
        // Already installed server-side: mark quietly, no toast.
        setInstalledKeys((prev) => ({ ...prev, [item.key]: true }));
        return;
      }
      if (!response.ok) {
        throw new Error(`Install request failed (${response.status})`);
      }
      setInstalledKeys((prev) => ({ ...prev, [item.key]: true }));
      toast.success(
        item.kind === "lab"
          ? `${item.name} instalado — ábrelo en un workspace → Labs`
          : `${item.name} instalado — despliégalo desde un workspace`
      );
      await fetchPackages();
    } catch (error) {
      console.error("Error installing catalog item:", error);
      toast.error(`No se pudo instalar ${item.name}. Inténtalo de nuevo.`);
    } finally {
      setInstallingKey(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const trimmedVersion = version.trim();
      const payload = {
        name: packageName.trim(),
        description: description.trim(),
        ...(trimmedVersion ? { version: trimmedVersion } : {})
      };
      const response = await fetch(`${PACKAGES_API}/packages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (redirectIfUnauthorized(response)) return;
      if (!response.ok) {
        throw new Error(`Create request failed (${response.status})`);
      }
      setOpenModal(false);
      setPackageName("");
      setDescription("");
      setVersion("");
      await fetchPackages();
    } catch (error) {
      console.error("Error creating package:", error);
      setCreateError("Could not create the plugin. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handlePackageClick = (packageId) => {
    history.push(`/package/${packageId}`);
  };

  const languages = [...new Set(packages.map((pkg) => pkg.language).filter(Boolean))].sort();

  const filteredPackages = packages.filter((pkg) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (pkg.name || "").toLowerCase().includes(term) ||
      (pkg.description || "").toLowerCase().includes(term);
    const matchesLanguage = languageFilter === "all" || pkg.language === languageFilter;
    return matchesSearch && matchesLanguage;
  });

  const runningContainers = containers.filter((c) => c.Status === "running").length;
  const stoppedContainers = containers.length - runningContainers;

  const statValue = (loading, error, value) => {
    if (loading) return "…";
    if (error) return "—";
    return value;
  };

  const stats = [
    {
      label: "Total Plugins",
      value: statValue(packagesLoading, packagesError, packages.length),
      icon: Package,
      color: "blue"
    },
    {
      label: "Running Containers",
      value: statValue(containersLoading, containersError, runningContainers),
      icon: Activity,
      color: "green"
    },
    {
      label: "Stopped Containers",
      value: statValue(containersLoading, containersError, stoppedContainers),
      icon: StopCircle,
      color: "yellow"
    },
    {
      label: "Docker Networks",
      value: statValue(networksLoading, networksError, networks.length),
      icon: Network,
      color: "purple"
    }
  ];

  const infraErrors = [containersError, networksError].filter(Boolean);

  // Catalog items whose name matches an existing package read as installed.
  const installedNames = new Set(
    packages.map((pkg) => (pkg.name || "").toLowerCase()).filter(Boolean)
  );
  const isItemInstalled = (item) =>
    Boolean(installedKeys[item.key]) ||
    installedNames.has((item.name || "").toLowerCase());
  const catalogExpanded =
    catalogToggle === null ? packages.length < 4 : catalogToggle;

  const catalogServicesLine = (item) =>
    Array.isArray(item.services) && item.services.length > 0
      ? item.services
          .map((service) => `${service.name} ×${service.replicas} · ${service.image}`)
          .join(", ")
      : null;

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
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
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

          {/* Infra fetch errors */}
          {infraErrors.length > 0 && (
            <div className="flex items-start space-x-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                {infraErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* App Catalog */}
        {catalogItems.length > 0 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 mb-8">
            <button
              onClick={() => setCatalogToggle(!catalogExpanded)}
              className="w-full flex items-center justify-between p-6 text-left"
            >
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-gray-500" />
                <h2 className="text-xl font-medium text-gray-900">App Catalog</h2>
                <span className="text-sm text-gray-500">
                  {catalogItems.length} {catalogItems.length === 1 ? "app" : "apps"}
                </span>
              </div>
              {catalogExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {catalogExpanded && (
              <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogItems.map((item) => {
                  const installed = isItemInstalled(item);
                  const installing = installingKey === item.key;
                  const servicesLine = catalogServicesLine(item);
                  return (
                    <div
                      key={item.key}
                      className="flex flex-col p-5 border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-3xl leading-none">{item.icon}</span>
                        <div className="flex items-center flex-wrap justify-end gap-1.5">
                          {item.category && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium">
                              {item.category}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              item.kind === "lab"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            {item.kind}
                          </span>
                        </div>
                      </div>
                      <h3 className="text-base font-medium text-gray-900 mb-1">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-3">
                        <span className="text-[11px] font-mono text-gray-500 truncate">
                          {item.kind === "lab"
                            ? `${item.steps ?? 0} steps`
                            : servicesLine}
                        </span>
                        <button
                          onClick={() => handleInstall(item)}
                          disabled={installed || installing}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
                            installed
                              ? "bg-gray-100 text-gray-500 cursor-default"
                              : "bg-black text-white hover:bg-gray-800 disabled:opacity-60"
                          }`}
                        >
                          {installed
                            ? "Installed ✓"
                            : installing
                              ? "Installing…"
                              : "Install"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                    autoComplete="off"
                    name="no-autofill"
                    type="text"
                    placeholder="Search plugins..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
                  />
                </div>

                {/* Language filter */}
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-sm"
                >
                  <option value="all">All Languages</option>
                  {languages.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Packages List */}
          <div className="p-6">
            {packagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
              </div>
            ) : packagesError ? (
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Couldn't load plugins</h3>
                <p className="text-gray-600 mb-6">{packagesError}</p>
                <button
                  onClick={fetchPackages}
                  className="px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium"
                >
                  Retry
                </button>
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
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          {pkg.icon && (
                            <span className="text-xl leading-none">{pkg.icon}</span>
                          )}
                          <h3 className="text-lg font-medium text-gray-900 group-hover:text-black">
                            {pkg.name || "Unnamed plugin"}
                          </h3>
                          {pkg.official && (
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-medium">
                              official
                            </span>
                          )}
                          {pkg.type && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              {pkg.type}
                            </span>
                          )}
                          {pkg.version && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                              v{pkg.version}
                            </span>
                          )}
                        </div>

                        {pkg.description && (
                          <p className="text-gray-600 mb-3 leading-relaxed">
                            {pkg.description}
                          </p>
                        )}

                        <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
                          {pkg.language && (
                            <div className="flex items-center space-x-1">
                              <Code className="w-4 h-4" />
                              <span>{pkg.language}</span>
                            </div>
                          )}
                          {Array.isArray(pkg.tags) && pkg.tags.length > 0 && (
                            <div className="flex items-center space-x-2">
                              <Tag className="w-4 h-4" />
                              <div className="flex items-center flex-wrap gap-1">
                                {pkg.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {pkg.tags.length > MAX_VISIBLE_TAGS && (
                                  <span className="text-xs text-gray-400">
                                    +{pkg.tags.length - MAX_VISIBLE_TAGS}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
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
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {packages.length === 0 ? "No plugins yet" : "No plugins found"}
                </h3>
                <p className="text-gray-600 mb-6">
                  {packages.length === 0
                    ? "Get started by creating your first plugin"
                    : "Try adjusting your search or filter criteria"
                  }
                </p>
                {packages.length === 0 && (
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

              <div>
                <label htmlFor="version" className="block text-sm font-medium text-gray-700 mb-2">
                  Version <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="version"
                  type="text"
                  autoComplete="off"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                  placeholder="1.0.0"
                />
              </div>

              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}

              {/* Actions */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSubmit}
                  disabled={!packageName.trim() || !description.trim() || creating}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {creating ? (
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
