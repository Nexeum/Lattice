import React, { useState } from "react";
import { Card, Button, Label, TextInput } from "flowbite-react";
import { Link } from "react-router-dom";
import axios from "axios";

export const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post("http://10.8.8.247:8000/register", {
        email,
        password,
      });

      alert(response.data.message);
    } catch (error) {
      if (error.response) {
        alert(error.response.data.detail);
      } else if (error.request) {
        console.error(error.request);
      } else {
        console.error("Error", error.message);
      }
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="vh-100 d-flex align-items-center justify-content-center">
        <Card className="p-5 shadow-lg">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Register
          </h1>
          <form onSubmit={register}>
            <Label htmlFor="email">Email Address</Label>
            <TextInput
              id="email"
              name="email"
              placeholder="name@kubehub.com"
              required
              type="email"
              className="mb-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Label htmlFor="password">Password</Label>
            <TextInput
              id="password"
              name="password"
              placeholder="••••••••"
              required
              type="password"
              className="mb-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit">Register</Button>
          </form>
          <div className="mt-3 text-white">
            <Link to="/">Already have an account? Login</Link>
          </div>
        </Card>
      </div>
    </div>
  );
};