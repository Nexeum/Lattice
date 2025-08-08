import React, { useState, useEffect } from "react";
import axios from "axios";
import { BrowserRouter as Router, Switch, Route, Redirect } from "react-router-dom";
import { Container, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { Register } from "./components/Register";
import { Dashboard } from "./components/Dashboard";
import { NavbarRC } from "./components/Navbar";
import { Right } from "./components/Right";
import { Statify } from "./components/Statify";
import { Nodesly } from "./components/Nodesly";
import { ContainerDetails } from "./components/ContainerDetails";
import { Room } from "./components/room";
import { Package } from "./components/Package";
import { Node } from "./components/Node";
import { Home } from "./components/Home";
import ApiDocumentation from './components/Api';


import "./App.css";

const useAuthentication = () => {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setAuthenticated(!!storedToken);
  }, []);

  return [authenticated, setAuthenticated];
};

// Nuevo componente Auth con estilo Apple
const Auth = ({ onAuthenticate }) => {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/login",
        credentials,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.data.token) {
        localStorage.setItem("token", response.data.token);
        onAuthenticate(true);
      }
    } catch (error) {
      setError("Invalid email or password. Please try again.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo and header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-black rounded-2xl mb-6 shadow-lg">
            <Container className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in to your Innoxus account</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={credentials.email}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-gray-900 placeholder-gray-400"
                placeholder="name@company.com"
              />
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={credentials.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200 text-gray-900 placeholder-gray-400"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Forgot password link */}
            <div className="text-right">
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Forgot your password?
              </a>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="group w-full px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Register link */}
        <div className="text-center mt-8">
          <p className="text-gray-600">
            Don't have an account?{" "}
            <Link to="/register" className="text-black font-medium hover:underline transition-all">
              Create one
            </Link>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-xs text-gray-500">
            By signing in, you agree to our{" "}
            <a href="#" className="hover:text-gray-700 transition-colors">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="hover:text-gray-700 transition-colors">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ component: Component, authenticated, ...rest }) => (
  <Route
    {...rest}
    render={(props) =>
      authenticated ? (
        <Component {...props} />
      ) : (
        <Redirect to={{ pathname: "/", state: { from: props.location } }} />
      )
    }
  />
);

function App() {
  const [authenticated, setAuthenticated] = useAuthentication();

  return (
    <div className="min-h-screen bg-gray-50">
      <Router>
        {authenticated ? (
          <div className="flex flex-col">
            <NavbarRC />
            <div className="flex flex-1">
              {/* Main Content - Responsive */}
              <main className="flex-1 min-w-0 lg:pr-80">
                <Switch>
                  <ProtectedRoute
                    exact
                    path="/"
                    component={Dashboard}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/nodesly"
                    component={Nodesly}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/statify"
                    component={Statify}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/container/:id"
                    component={ContainerDetails}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/room/:id"
                    component={Room}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/package/:id"
                    component={Package}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/room/:roomId/node/:nodeId"
                    component={Node}
                    authenticated={authenticated}
                  />
                  <ProtectedRoute
                    exact
                    path="/api-docs"
                    component={ApiDocumentation}
                    authenticated={authenticated}
                  />
                </Switch>
              </main>
              
              {/* Right Sidebar - Hidden on mobile, fixed on desktop */}
              <aside className="hidden lg:block fixed right-0 top-16 w-80 h-screen">
                <Right />
              </aside>
            </div>
          </div>
        ) : (
          <Switch>
            <Route exact path="/">
              <Home />
            </Route>
            <Route exact path="/register">
              <Register />
            </Route>
            <Route exact path="/auth">
              <Auth onAuthenticate={setAuthenticated} />
            </Route>
          </Switch>
        )}
      </Router>
    </div>
  );
}

export default App;