import React, { useState, useEffect } from "react";
import { Card, Spinner, Table, Badge, Button } from "flowbite-react";
import axios from "axios";
import { Link } from "react-router-dom";

const useContainers = () => {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchContainers = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:5001/containers");
      setContainers(response.data);
    } catch (error) {
      console.error(error);
      setError("Error fetching containers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return { containers, fetchContainers, loading, error };
};

const getBadgeColor = (status) => {
  if (status.startsWith("running")) {
    return "success";
  } else if (status.startsWith("exited")) {
    return "failure";
  } else {
    return "gray";
  }
};

export const Statify = () => {
  const { containers, fetchContainers, loading, error } = useContainers();

  useEffect(() => {
    fetchContainers();
  }, []);

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800 p-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
          Local Containers
        </h2>
        {loading && <Spinner />}
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {!loading && !error && (
          <Table hoverable className="mt-4 divide-y divide-gray-200">
            <Table.Head>
              <Table.HeadCell>Name</Table.HeadCell>
              <Table.HeadCell>IP</Table.HeadCell>
              <Table.HeadCell>Port</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell>Actions</Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {containers.map((container) => (
                <Table.Row key={container.ID}>
                  <Table.Cell>{container.Names}</Table.Cell>
                  <Table.Cell>{container.IP}</Table.Cell>
                  <Table.Cell>{container.Port}</Table.Cell>
                  <Table.Cell>
                    <Badge color={getBadgeColor(container.Status)}>
                      {container.Status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {container.Port && container.Port !== "N/A" && (
                      <Link to={`/container/${container.ID}`}>
                        <Button>View</Button>
                      </Link>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>
    </div>
  );
};
