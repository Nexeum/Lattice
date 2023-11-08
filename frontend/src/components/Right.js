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
          </div>
        </Card>
        <Card className="max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Recent Commits
          </h1>
          <Timeline>
            <Timeline.Item>
              <Timeline.Point />
              <Timeline.Content>
                <Timeline.Time>Commit Hash: a1b2c3d4</Timeline.Time>
                <Timeline.Title>Added new feature</Timeline.Title>
                <Timeline.Body>
                  <p>
                    Implemented the new feature as per the design document. All tests are passing.
                  </p>
                </Timeline.Body>
              </Timeline.Content>
            </Timeline.Item>
            <Timeline.Item>
              <Timeline.Point />
              <Timeline.Content>
                <Timeline.Time>Commit Hash: e5f6g7h8</Timeline.Time>
                <Timeline.Title>Fixed bug in login system</Timeline.Title>
                <Timeline.Body>
                  <p>
                    Fixed a bug where users were unable to login due to a database error. Added additional error handling.
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
