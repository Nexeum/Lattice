import React from "react";
import { Link, useHistory } from "react-router-dom";
import { Container } from "lucide-react";

export const PublicNavbar = () => {
  const history = useHistory();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Container className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-medium text-gray-900">Lattice</span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <a href="/#features" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Features</a>
            <Link to="/api-docs" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Docs</Link>
          </div>

          <button
            className="px-5 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
            onClick={() => history.push("/auth")}
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
};
