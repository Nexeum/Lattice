import React, { useState, useEffect } from "react";
import { Card, Button, Timeline } from "flowbite-react";
import axios from "axios";

export const Right = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [storedToken, setStoredToken] = useState("");
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setAuthenticated(true);
      axios
        .get("http://localhost:5000/userData", {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        })
        .then((response) => {
          setUserData(response.data);
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }, [storedToken]);

  let userDataObject;
  if (userData && typeof userData === 'string') {
    userDataObject = JSON.parse(userData);
  } else {
    userDataObject = userData;
  }

  return (
    <div className="rounded-lg p-8">
      <div className="relative overflow-x-auto">
        <Card className="max-w-sm mb-4">
          <div className="flex flex-col items-center pb-10">
            <img
              alt="User image"
              height="96"
              src="https://cdn-icons-png.flaticon.com/128/6864/6864026.png"
              width="96"
              className="mb-3 rounded-full shadow-lg"
            />
            <h5 className="mb-1 text-xl font-medium text-gray-900 dark:text-white">
              {userDataObject && userDataObject.data && userDataObject.data.fullname ? userDataObject.data.fullname : ""}
            </h5>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {userDataObject && userDataObject.data && userDataObject.data.email ? userDataObject.data.email : ""}
            </span>
            <div className="mt-4 flex space-x-3 lg:mt-6">
              <a
                href="#"
                className="inline-flex items-center rounded-lg bg-red-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800"
              >
                Log Out
              </a>
            </div>
          </div>
        </Card>
        <Card className="max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Latest Updates
          </h1>
          <Timeline>
            <Timeline.Item>
              <Timeline.Point />
              <Timeline.Content>
                <Timeline.Time>February 2022</Timeline.Time>
                <Timeline.Title>Collaborative Room Created</Timeline.Title>
                <Timeline.Body>
                  <p>
                    A new collaborative room was created for team programming.
                  </p>
                </Timeline.Body>
              </Timeline.Content>
            </Timeline.Item>
            <Timeline.Item>
              <Timeline.Point />
              <Timeline.Content>
                <Timeline.Time>March 2022</Timeline.Time>
                <Timeline.Title>Overload System Implemented</Timeline.Title>
                <Timeline.Body>
                  <p>
                    An overload system was implemented to visualize metrics such
                    as p99, p95, p90, mean, min, max, and latency.
                  </p>
                </Timeline.Body>
              </Timeline.Content>
            </Timeline.Item>
          </Timeline>
        </Card>
      </div>
    </div>
  );
};
