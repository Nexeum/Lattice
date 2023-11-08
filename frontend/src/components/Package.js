import React, { useState, useEffect } from "react";
import { Card, Button, Table } from "flowbite-react";
import { FaCodeBranch, FaTag, FaStar, FaDownload, FaFolder, FaFile } from 'react-icons/fa';
import axios from 'axios';
import { useParams } from "react-router-dom";

export const Package = () => {
    const [packageData, setPackageData] = useState(null);
    const { id } = useParams();

    useEffect(() => {
        const fetchData = async () => {
            const response = await axios.get(`http://localhost:5003/packages/${id}`);
            setPackageData(response.data);
        };

        fetchData();
    }, [id]);

    return (
        <div className="flex flex-col p-8 space-y-4">
            <Card className="w-full space-y-4">

                {packageData && (
                    <>
                        <Card className="w-full rounded-xl shadow-md dark:bg-gray-800 p-2">
                            <div className="flex justify-between items-center">
                                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                    {packageData.name}
                                </h1>
                                <div className="flex">
                                    <Button size="xs" className="mr-2">
                                        <FaStar className="mr-2 h-5 w-5"/> {packageData.stars}
                                    </Button>
                                    <Button size="xs" color="blue">
                                        <FaDownload  className="mr-2 h-5 w-5" /> Download
                                    </Button>
                                </div>
                            </div>
                        </Card>
                        <div className="flex space-x-4">
                            <Card className="w-3/4 rounded-xl shadow-md dark:bg-gray-800">
                                <Table hoverable>
                                    {packageData.files.map((file, index) => (
                                        <Table.Row key={index}>
                                            <Table.Cell>
                                                <div className="flex items-center">
                                                    {file.name.endsWith('.txt') || file.name.endsWith('.bat') ? <FaFile /> : <FaFolder />}
                                                    <span className="ml-2">{file.name}</span>
                                                </div>
                                            </Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table>
                            </Card>
                            <Card className="w-1/4 rounded-xl shadow-md dark:bg-gray-800 p-4">
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
                            </Card>
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
};