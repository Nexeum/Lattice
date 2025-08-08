import React, { useState, useEffect } from "react";
import { 
  User, 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Loader, 
  Star, 
  GitBranch, 
  Tag, 
  Code,
  Zap,
  Clock,
  TrendingUp,
  Server
} from "lucide-react";

export const Right = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showEnvironmentCard, setShowEnvironmentCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [packageData, setPackageData] = useState(null);
  const [concurrentClients, setConcurrentClients] = useState(0);
  const [averageResponseTime, setAverageResponseTime] = useState(0);
  const [qps, setQps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  // Get current path to determine what to show
  const currentPath = window.location.pathname;
  const pathSegments = currentPath.split('/');
  const id = pathSegments[pathSegments.length - 1];

  const validationSteps = [
    'Initializing Orchestrator Docker Instance',
    'Configuring Docker Environment', 
    'Integrating Service with Orchestrator',
    'Launching Orchestrator Service'
  ];

  const [apiStatus, setApiStatus] = useState([
    { label: "AUTH", status: "operational", percentage: 99 },
    { label: "NLP", status: "operational", percentage: 98 },
    { label: "Storage", status: "operational", percentage: 95 },
  ]);

  // Mock user data
  useEffect(() => {
    setUserData({
      data: {
        fullname: "John Doe",
        email: "nexeum@nexeum.com"
      }
    });
    setAuthenticated(true);
  }, []);

  // Mock package data
  useEffect(() => {
    if (currentPath.includes("/package")) {
      setPackageData({
        description: "Advanced container orchestration platform with ML-powered optimization",
        branches: 5,
        tags: 12,
        stars: 142,
        languages: [
          { name: "JavaScript", percentage: 45, color: "bg-yellow-400" },
          { name: "Python", percentage: 30, color: "bg-blue-500" },
          { name: "Go", percentage: 15, color: "bg-cyan-400" },
          { name: "Shell", percentage: 10, color: "bg-green-500" }
        ]
      });
    }
  }, [currentPath]);

  // Mock container performance data
  useEffect(() => {
    if (currentPath.includes("/container")) {
      setConcurrentClients(24);
      setAverageResponseTime(0.34);
      setQps(156);
    }
  }, [currentPath]);

  // Environment setup simulation
  useEffect(() => {
    if (currentPath.includes("/room")) {
      setShowEnvironmentCard(true);
      setLoading(true);
      
      let stepIndex = 0;
      const interval = setInterval(() => {
        setCurrentStep(stepIndex);
        stepIndex++;
        
        if (stepIndex >= validationSteps.length) {
          clearInterval(interval);
          setLoading(false);
          setSuccess(true);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setShowEnvironmentCard(false);
      setLoading(false);
      setSuccess(false);
      setCurrentStep(0);
    }
  }, [currentPath]);

  return (
    <div className="w-full h-full bg-gray-50 border-l border-gray-200 overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* User Profile Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <User className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {userData?.data?.fullname || "User"}
            </h3>
            <p className="text-sm text-gray-600">
              {userData?.data?.email || "user@innoxus.com"}
            </p>
          </div>
        </div>

        {/* Environment Setup Card */}
        {showEnvironmentCard && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center space-x-2 mb-4">
              <Server className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-900">Environment Setup</h3>
            </div>
            
            <div className="space-y-3">
              {validationSteps.map((step, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {index < currentStep || success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : index === currentStep && loading ? (
                      <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                    )}
                  </div>
                  <p className={`text-sm ${
                    index <= currentStep || success ? "text-gray-900" : "text-gray-500"
                  }`}>
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Status Card */}
        {currentPath.includes("/tars") && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center space-x-2 mb-4">
              <Activity className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-medium text-gray-900">API Status</h3>
            </div>
            
            <div className="space-y-4">
              {apiStatus.map((service, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-900">{service.label}</span>
                    </div>
                    <span className="text-xs text-gray-600">{service.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${service.percentage}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Operational</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Package Info Card */}
        {currentPath.includes("/package") && packageData && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">About</h3>
            
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              {packageData.description}
            </p>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center space-x-3">
                <GitBranch className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">{packageData.branches} Branches</span>
              </div>
              <div className="flex items-center space-x-3">
                <Tag className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">{packageData.tags} Tags</span>
              </div>
              <div className="flex items-center space-x-3">
                <Star className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">{packageData.stars} Stars</span>
              </div>
            </div>
            
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Languages</h4>
              <div className="space-y-2">
                {packageData.languages?.map((language, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{language.name}</span>
                      <span className="text-xs text-gray-500">{language.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${language.color}`}
                        style={{ width: `${language.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Performance Metrics Card */}
        {currentPath.includes("/container") && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-medium text-gray-900">Performance</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Concurrent Clients</span>
                </div>
                <p className="text-2xl font-light text-gray-900">{concurrentClients}</p>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <Clock className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Avg Response Time</span>
                </div>
                <p className="text-2xl font-light text-gray-900">{averageResponseTime}s</p>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <Activity className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Queries/Second</span>
                </div>
                <p className="text-2xl font-light text-gray-900">{qps}</p>
              </div>
            </div>
          </div>
        )}

        {/* System Health Card - Always visible */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <Activity className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-medium text-gray-900">System Health</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">CPU Usage</span>
              <span className="text-sm font-medium text-gray-900">32%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: '32%' }}></div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Memory</span>
              <span className="text-sm font-medium text-gray-900">68%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '68%' }}></div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Storage</span>
              <span className="text-sm font-medium text-gray-900">45%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full" style={{ width: '45%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};