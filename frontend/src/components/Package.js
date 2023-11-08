import React, { useState } from "react";
import { Card, Button, TextInput, Label } from "flowbite-react";

export const Package = () => {
    const [packageName, setPackageName] = useState("");
    const [description, setDescription] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log(`Package Name: ${packageName}, Description: ${description}`);
    };

    return (
        <div className="flex flex-col p-8">
            <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Package
                </h1>
            </Card >
        </div >
    );
};