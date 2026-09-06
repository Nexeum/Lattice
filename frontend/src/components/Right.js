import React, { useState, useEffect } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import {
  User,
  Activity,
  Star,
  Tag,
  Code,
} from "lucide-react";

const USER_API_URL = "http://localhost:5005/userData";
const HEALTH_API_URL = "http://localhost:5001/system/health";
const PACKAGES_API_URL = "http://localhost:5003/packages";
const HEALTH_POLL_INTERVAL_MS = 10000;

const HEALTH_METRICS = [
  { key: "cpu", label: "CPU Usage", barColor: "bg-blue-500" },
  { key: "memory", label: "Memory", barColor: "bg-yellow-500" },
  { key: "storage", label: "Storage", barColor: "bg-green-500" },
];

export const Right = () => {
  const [userData, setUserData] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState(null);
  const [packageData, setPackageData] = useState(null);

  // Current path determines what to show; useLocation keeps it in
  // sync with SPA navigation (history.push) without a full reload.
  const location = useLocation();
  const currentPath = location.pathname;
  const pathSegments = currentPath.split("/");
  const id = pathSegments[pathSegments.length - 1];

  // Real user data
  useEffect(() => {
    let isMounted = true;

    const fetchUserData = async () => {
      try {
        const response = await axios.get(USER_API_URL, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        // Backend returns a JSON-encoded string (json_util.dumps)
        const parsed =
          typeof response.data === "string"
            ? JSON.parse(response.data)
            : response.data;
        if (isMounted) {
          setUserData(parsed);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        if (isMounted) {
          setUserLoading(false);
        }
      }
    };

    fetchUserData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Real system health data, polled every 10 seconds
  useEffect(() => {
    let isMounted = true;

    const fetchSystemHealth = async () => {
      try {
        const response = await axios.get(HEALTH_API_URL);
        if (isMounted) {
          setSystemHealth(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch system health:", error);
        if (isMounted) {
          setSystemHealth(null);
        }
      }
    };

    fetchSystemHealth();
    const interval = setInterval(fetchSystemHealth, HEALTH_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Real package data when viewing a plugin
  useEffect(() => {
    let isMounted = true;

    const fetchPackageData = async () => {
      try {
        const response = await axios.get(`${PACKAGES_API_URL}/${id}`);
        if (isMounted) {
          setPackageData(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch package data:", error);
        if (isMounted) {
          setPackageData(null);
        }
      }
    };

    if (currentPath.includes("/package") && id) {
      fetchPackageData();
    } else {
      setPackageData(null);
    }

    return () => {
      isMounted = false;
    };
  }, [currentPath, id]);

  const userEmail = userData?.data?.email || null;
  const displayName = userEmail ? userEmail.split("@")[0] : null;

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
              {userLoading ? "…" : displayName || "—"}
            </h3>
            <p className="text-sm text-gray-600">
              {userLoading ? "…" : userEmail || "—"}
            </p>
          </div>
        </div>

        {/* Package Info Card */}
        {currentPath.includes("/package") && packageData && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">About</h3>

            {packageData.description && (
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {packageData.description}
              </p>
            )}

            <div className="space-y-3">
              {typeof packageData.stars === "number" && (
                <div className="flex items-center space-x-3">
                  <Star className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">{packageData.stars} Stars</span>
                </div>
              )}
              {packageData.language && (
                <div className="flex items-center space-x-3">
                  <Code className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">{packageData.language}</span>
                </div>
              )}
              {Array.isArray(packageData.tags) && packageData.tags.length > 0 && (
                <div className="flex items-center space-x-3">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">{packageData.tags.join(", ")}</span>
                </div>
              )}
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
            {HEALTH_METRICS.map((metric) => {
              const rawValue = systemHealth?.[metric.key];
              const value = typeof rawValue === "number" ? rawValue : null;

              return (
                <React.Fragment key={metric.key}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{metric.label}</span>
                    <span className="text-sm font-medium text-gray-900">
                      {value !== null ? `${Math.round(value)}%` : "—"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${metric.barColor} h-2 rounded-full transition-all duration-300`}
                      style={{ width: `${value !== null ? Math.min(Math.max(value, 0), 100) : 0}%` }}
                    ></div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
