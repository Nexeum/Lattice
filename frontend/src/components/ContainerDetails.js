import axios from "axios";
import { Link } from "react-router-dom";
import { Card, Button, Spinner } from "flowbite-react";

export const ContainerDetails = () => {
  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Local Containers
        </h2>
 
        <div className="flex space-x-4">
          <Card className="space-y-4 rounded-xl shadow-md dark:bg-gray-800">
            <p className="text-gray-500 dark:text-gray-400">
              Click the button below to fetch the local containers.
            </p>
          </Card>
          <Card className="space-y-4 rounded-xl shadow-md dark:bg-gray-800">
            <p className="text-gray-500 dark:text-gray-400">
              Click the button below to fetch the local containers.
            </p>
          </Card>
        </div>
      </Card>
    </div>
  );
};