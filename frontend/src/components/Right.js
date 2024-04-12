import React, { useState, useEffect } from "react";
import { Card, Spinner } from "flowbite-react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import { FaCodeBranch, FaTag, FaStar, FaFile } from 'react-icons/fa';

export const Right = () => {
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState(false);
  const [storedToken, setStoredToken] = useState("");
  const [userData, setUserData] = useState(null);
  const [showEnvironmentCard, setShowEnvironmentCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [packageData, setPackageData] = useState(null);
  const [concurrentClients, setConcurrentClients] = useState(0);
  const [averageResponseTime, setAverageResponseTime] = useState(0);
  const [qps, setQps] = useState(0);

  const pathSegments = window.location.pathname.split('/');
  const id = pathSegments[pathSegments.length - 1];

  useEffect(() => {
    if (window.location.pathname.includes("/package")) {
      const fetchData = async () => {
        const response = await axios.get(`http://10.8.8.247:5003/packages/${id}`);
        setPackageData(response.data);
      };

      fetchData();
    }
  }, [id]);

  useEffect(() => {
    if (window.location.pathname.includes("/container")) {
      const calculatedConcurrentClients = qps * averageResponseTime;
      setConcurrentClients(calculatedConcurrentClients);

      axios.get(`http://10.8.8.247:5001/container/${id}/aprox`)
        .then(response => {
          const roundedAverageResponseTime = Math.round(response.data.averageResponseTime * 100) / 100;
          const roundedQps = Math.round(response.data.qps);
          setAverageResponseTime(roundedAverageResponseTime);
          setQps(roundedQps);
        })
        .catch(error => {
          console.error(error);
        });
    }
  }, [id, qps, averageResponseTime]);

  const validationSteps = [
    'Initializing Orchestrator Docker Instance',
    'Configuring Docker Environment',
    'Integrating Service with Orchestrator',
    'Launching Orchestrator Service'
  ];

  const [apiStatus, setApiStatus] = useState([]);

  useEffect(() => {
    const fakeApiStatus = [
      { label: "AUTH", status: "green", percentage: 85 },
      { label: "NLP", status: "green", percentage: 98 },
      { label: "Storage Data", status: "green", percentage: 70 },
    ];
    setApiStatus(fakeApiStatus);
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setAuthenticated(true);
      axios
        .get("http://127.0.0.1:8000/userData", {
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

  useEffect(() => {
    if (location.pathname.includes("/room")) {
      const id = location.pathname.split("/")[2];
      setLoading(true);
      axios.post(`http://10.8.8.247:5001/containermain/${id}`)
        .then(response => {
          setLoading(false);
          setSuccess(true);
          setShowEnvironmentCard(true);
        })
        .catch(error => {
          console.error(error);
          setLoading(false);
          setShowEnvironmentCard(false);
        });
    } else {
      setShowEnvironmentCard(false);
    }
  }, [location.pathname]);

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
              src="https://th.bing.com/th/id/OIG.q3iFkMBl3odPVneKCIWg?pid=ImgGn"
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
        {showEnvironmentCard ? (
          <Card className="max-w-sm mb-4">
            <div className="p-4">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4 flex text-center justify-center items-center">
                Setting up the environment
              </h2>
              {validationSteps.map((step, index) => (
                <div key={index} className="flex items-center justify-center space-x-2">
                  <p className="text-white">{step}</p>
                  {loading ? <Spinner /> : success ? <svg
                    className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg> : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
        {location.pathname.includes("/tars") ? (
          <Card className="max-w-sm mb-4">
            <div className="p-4">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4 text-center">
                API Status
              </h2>
              {apiStatus.map((service, index) => (
                <div key={index} className="mb-4">
                  <div className="flex items-center mb-2">
                    <p className={`text-${service.status}-500`}>{service.label}</p>
                    <div
                      className={`w-4 h-4 rounded-full bg-${service.status}-500 ml-2`}
                    ></div>
                  </div>
                  <div className={`bg-gray-200 dark:bg-gray-800 h-4 rounded-lg`}>
                    <div
                      className={`h-full rounded-lg bg-${service.status}-500`}
                      style={{
                        width: `100%`,
                        backgroundImage: `linear-gradient(90deg, green ${service.percentage}%, red ${service.percentage}%)`
                      }}
                    ></div>
                  </div>
                  <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">
                    {`${service.percentage}% Operational`}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
        {location.pathname.includes("/package") && packageData ? (
          <Card className="max-w-sm mb-4">
            <h2 className="text-xl font-bold tracking-tight text-white mt-4">
              About
            </h2>
            <p className="text-white">{packageData.description || 'No description, website, or topics provided.'}</p>
            <div className="flex items-center space-x-2">
              <FaCodeBranch className="text-gray-500" />
              <p className="text-white">{packageData.branches || 0} Branches</p>
            </div>
            <div className="flex items-center space-x-2">
              <FaTag className="text-gray-500" />
              <p className="text-white">{packageData.tags || 0} Tags</p>
            </div>
            <div className="flex items-center space-x-2">
              <FaStar className="text-gray-500" />
              <p className="text-white">{packageData.stars || 0} Stars</p>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white mt-4">
              Languages
            </h2>
            <div className="w-full p-4">
              {packageData.languages && packageData.languages.map((language, index) => (
                <div key={index} className="w-full h-2 mb-4 rounded bg-gray-800">
                  <div style={{ width: `${language.percentage}%` }} className={`h-full rounded ${language.color}`}></div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
        {location.pathname.includes("/container") ? (
          <Card className="max-w-sm mb-4">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
              Performance Test
            </h1>
            <Card className="flex-grow space-y-4 rounded-xl shadow-md dark:bg-gray-800">
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Concurrent Clients: {concurrentClients}
              </h3>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Average Response Time: {averageResponseTime} seconds
              </h3>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Queries Per Second: {qps}
              </h3>
            </Card>
          </Card>
        ) : null}
      </div>
    </div>
  );
};