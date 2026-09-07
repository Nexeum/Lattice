import React, { useState, useEffect } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import {
  User,
  Star,
  Tag,
  Code,
  Boxes,
  Server,
  Network,
  Plus,
} from "lucide-react";
import { authHeaders, redirectIfUnauthorized } from "../lib/api";
import {
  subscribeWorkspaceInfo,
  triggerWorkspaceAction,
} from "../lib/workspaceBridge";

const PACKAGES_API_URL = "http://localhost:5003/packages";

export const Right = () => {
  const [packageData, setPackageData] = useState(null);
  const [workspaceInfo, setWorkspaceInfo] = useState(null);

  // Current path determines what to show; useLocation keeps it in
  // sync with SPA navigation (history.push) without a full reload.
  const location = useLocation();
  const currentPath = location.pathname;
  const pathSegments = currentPath.split("/");
  const id = pathSegments[pathSegments.length - 1];

  // Real package data when viewing a plugin
  useEffect(() => {
    let isMounted = true;

    const fetchPackageData = async () => {
      try {
        const response = await axios.get(`${PACKAGES_API_URL}/${id}`, {
          headers: { ...authHeaders() },
        });
        if (isMounted) {
          setPackageData(response.data);
        }
      } catch (error) {
        console.error("Failed to fetch package data:", error);
        if (redirectIfUnauthorized(error.response)) return;
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

  // Workspace snapshot published by the room page (separate React tree).
  useEffect(() => {
    const unsubscribe = subscribeWorkspaceInfo((info) => {
      setWorkspaceInfo(info);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const showPackageCard =
    currentPath.includes("/package") && packageData;

  // Nothing contextual to show (e.g. Dashboard) — render nothing so the
  // layout can reclaim the space instead of leaving an empty gutter.
  if (!showPackageCard && !workspaceInfo) {
    return null;
  }

  return (
    <div className="w-full h-full bg-gray-50 border-l border-gray-200 overflow-y-auto">
      <div className="p-6 space-y-6">
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

        {/* Workspace Card - only while inside a workspace (published by room.js) */}
        {workspaceInfo && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center space-x-2 mb-4">
              <Boxes className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-medium text-gray-900">Workspace</h3>
            </div>

            <div className="flex items-center justify-between space-x-2 mb-3">
              <span className="font-medium text-gray-900 truncate">
                {workspaceInfo.name}
              </span>
              <span
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                  workspaceInfo.running
                    ? "bg-green-100 text-green-700"
                    : workspaceInfo.status === "provisioning"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    workspaceInfo.running
                      ? "bg-green-500 animate-pulse"
                      : workspaceInfo.status === "provisioning"
                      ? "bg-amber-500"
                      : "bg-gray-400"
                  }`}
                ></span>
                <span>
                  {workspaceInfo.running
                    ? "running"
                    : workspaceInfo.status === "provisioning"
                    ? "provisioning"
                    : "stopped"}
                </span>
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate">
                  {workspaceInfo.owner || "Unknown owner"}
                </span>
              </div>
              <p className="text-xs text-gray-400 font-mono truncate">
                {workspaceInfo.parentName}
              </p>
              {workspaceInfo.host && workspaceInfo.host !== "local" && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  <Server className="w-3 h-3" />
                  <span className="font-mono">{workspaceInfo.host}</span>
                </span>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Containers</span>
                <span className="font-medium text-gray-900">
                  {workspaceInfo.childrenCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex-shrink-0">Selected</span>
                <span className="font-mono text-xs text-gray-900 truncate ml-2">
                  {workspaceInfo.selectedLabel}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => triggerWorkspaceAction("network")}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-all duration-200 text-sm font-medium"
              >
                <Network className="w-4 h-4" />
                <span>Network View</span>
              </button>
              <button
                onClick={() => triggerWorkspaceAction("create-node")}
                disabled={!workspaceInfo.running}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Create Node</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
