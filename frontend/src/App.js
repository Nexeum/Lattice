import React, { useState, useEffect } from "react";
import axios from "axios";
import { BrowserRouter as Router, Switch, Route, Redirect } from "react-router-dom";
import { Button, Label, TextInput, Card } from "flowbite-react";
import { Link } from "react-router-dom";

import { Register } from "./components/Register";
import { Dashboard } from "./components/Dashboard";
import { NavbarRC } from "./components/Navbar";
import { Right } from "./components/Right";
import { Statify } from "./components/Statify";
import { Nodesly } from "./components/Nodesly";
import { Tars } from "./components/Tars";
import { ContainerDetails } from "./components/ContainerDetails";
import { Room } from "./components/room";
import { Package } from "./components/Package";
import { Node } from "./components/Node";

import "./App.css";

const useAuthentication = () => {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setAuthenticated(!!storedToken);
  }, []);

  return [authenticated, setAuthenticated];
};

const Auth = ({ onAuthenticate }) => {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        "http://localhost:5000/login",
        credentials,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.data.token) {
        localStorage.setItem("token", response.data.token);
        onAuthenticate(true);
      }
    } catch (error) {
      setError("Error during login. Please try again.");
      console.error(error);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="vh-100 d-flex align-items-center justify-content-center">
        <Card className="p-5 shadow-lg">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Login
          </h1>
          <form onSubmit={handleSubmit}>
            <Label htmlFor="email">Email Address</Label>
            <TextInput
              id="email"
              name="email"
              placeholder="name@kubehub.com"
              required
              type="email"
              value={credentials.email}
              onChange={handleChange}
              className="mb-3"
            />
            <Label htmlFor="password">Password</Label>
            <TextInput
              id="password"
              name="password"
              placeholder="••••••••"
              required
              type="password"
              value={credentials.password}
              onChange={handleChange}
              className="mb-3"
            />
            {error && <p>{error}</p>}
            <Button type="submit">Log In</Button>
            <div className="mt-3 text-white">
              <Link to="/register">Don't have an account? Register</Link>
            </div>
          </form>
        </Card>
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
    <div>
      <Router>
        {authenticated ? (
          <>
            <NavbarRC />
            <div className="flex">
              <div className="w-4/5">
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
                    path="/tars"
                    component={Tars}
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

                </Switch>
              </div>
              <div className="w-1/5">
                <Right />
              </div>
            </div>
          </>
        ) : (
          <Switch>
            <Route exact path="/">
              <Auth onAuthenticate={setAuthenticated} />
            </Route>
            <Route path="/register" component={Register} />
          </Switch>
        )}
      </Router>
    </div>
  );
}

export default App;