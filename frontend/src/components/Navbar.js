import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Container, Menu, X, Code, LogOut, User, Search, Moon, Sun } from "lucide-react";
import { authHeaders } from "../lib/api";
import { getTheme, toggleTheme } from "../lib/theme";
import { openPalette } from "./CommandPalette";

const USER_API_URL = "http://localhost:5005/userData";

export const NavbarRC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [theme, setTheme] = useState(getTheme);

  const location = useLocation();
  const currentPath = location.pathname;

  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const response = await fetch(USER_API_URL, {
          headers: { ...authHeaders() },
        });
        if (!response.ok) {
          throw new Error(`User request failed with status ${response.status}`);
        }
        const raw = await response.json();
        // Backend returns a JSON-encoded string (json_util.dumps)
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (isMounted) {
          setUserEmail(parsed?.data?.email || null);
        }
      } catch (error) {
        console.error("Failed to fetch user data for navbar:", error);
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const displayName = userEmail ? userEmail.split("@")[0] : null;

  const navLinks = [
    { to: "/", label: "Dashboard", icon: Container },
    { to: "/nodesly", label: "Nodes", icon: Container }
  ];

  const handleToggleTheme = () => {
    setTheme(toggleTheme());
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  const isActiveLink = (path) => {
    return currentPath === path;
  };

  return (
    <>
      {/* Fixed navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Container className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-medium text-gray-900">Lattice</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    isActiveLink(link.to)
                      ? "bg-black text-white"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side actions */}
            <div className="hidden md:flex items-center space-x-3">
              {/* Command palette trigger */}
              <button
                onClick={() => openPalette()}
                className="flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200"
                aria-label="Open command palette"
              >
                <Search className="w-4 h-4" />
                <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded">
                  ⌘K
                </kbd>
              </button>

              {/* Theme toggle */}
              <button
                onClick={handleToggleTheme}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {/* API Button - links to documentation */}
              <Link
                to="/api-docs"
                className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all duration-200 text-sm font-medium ${
                  isActiveLink('/api-docs')
                    ? "bg-black text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Code className="w-4 h-4" />
                <span>API</span>
              </Link>

              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <User className="w-4 h-4 text-gray-600" />
                </button>

                {/* Dropdown Menu */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-lg border border-gray-100 py-2">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">
                        {displayName || "—"}
                      </p>
                      <p className="text-xs text-gray-500">{userEmail || "—"}</p>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="flex items-center space-x-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              {isMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100">
            <div className="px-6 py-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActiveLink(link.to)
                      ? "bg-black text-white"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {/* Mobile API and Profile */}
              <div className="pt-4 border-t border-gray-100 space-y-2">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    openPalette();
                  }}
                  className="flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium w-full text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                >
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                  <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded">
                    ⌘K
                  </kbd>
                </button>

                <button
                  onClick={handleToggleTheme}
                  className="flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium w-full text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                  <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>

                <Link
                  to="/api-docs"
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium w-full ${
                    isActiveLink('/api-docs')
                      ? "bg-black text-white"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <Code className="w-4 h-4" />
                  <span>API Documentation</span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 text-sm font-medium w-full"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Backdrop for mobile menu */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-40 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}

      {/* Backdrop for profile dropdown */}
      {isProfileOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsProfileOpen(false)}
        ></div>
      )}
    </>
  );
};