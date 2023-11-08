import React, { useState, useEffect } from "react";
import { Card, Button, TextInput, Label } from "flowbite-react";
import axios from 'axios';

export const Package = ({ packageId }) => {
    const [packageData, setPackageData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            const response = await axios.get(`/packages/${packageId}`);
            setPackageData(response.data);
        };

        fetchData();
    }, [packageId]);

    return (
        <div className="flex flex-col p-8">
            <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Package
                </h1>
                {packageData && (
                    <div>
                        <p><strong>Package Name:</strong> {packageData.name}</p>
                        <p><strong>Description:</strong> {packageData.description}</p>
                        {/* Add more fields as needed */}
                    </div>
                )}
            </Card >
        </div >
    );
};