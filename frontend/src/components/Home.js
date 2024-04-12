import React from "react";
import { Card, Button } from "flowbite-react";
import { useHistory } from "react-router-dom";

export const Home = () => {
    const history = useHistory();

    const navigateToAuth = () => {
        history.push("/auth");
    };

    return (
        <div className="flex justify-center items-center h-screen">
            <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Welcome to Innoxus
                    </h2>
                    <Button onClick={navigateToAuth} color="primary">
                        Go to Auth
                    </Button>
                </div>
            </Card>
        </div>
    );
};