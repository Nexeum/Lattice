import React, { useState } from "react";
import { Card, Button, Spinner, Table, Badge } from "flowbite-react";
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

export const Statify = () => {
  const { containers, fetchContainers, loading, error } = useContainers();
  const [showTable, setShowTable] = useState(false);

  const handleScan = async () => {
    await fetchContainers();
    setShowTable(true);
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

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Local Containers
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Click the button below to fetch the local containers.
        </p>
        <Button
          onClick={handleScan}
          color="light"
          className="flex items-center space-x-2"
        >
          {loading ? <Spinner /> : "Get containers"}
        </Button>
        {error && <p>{error}</p>}
        {showTable && (
          <Table hoverable className="mt-4">
            <Table.Head>
              <Table.HeadCell>Name</Table.HeadCell>
              <Table.HeadCell>IP</Table.HeadCell>
              <Table.HeadCell>Port</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell>Actions</Table.HeadCell>
            </Table.Head>
            <Table.Body className="divide-y">
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
                    <Link to={`/container/${container.ID}`}>
                      <Button color="light">Ver</Button>
                    </Link>
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
