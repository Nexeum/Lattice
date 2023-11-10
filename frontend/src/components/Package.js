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
            {packageData && (

                <Card className="w-full space-y-4">
                    <Card className="w-full rounded-xl shadow-md dark:bg-gray-800 p-2">
                        <div className="flex justify-between items-center">
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                                {packageData.name}
                            </h1>
                            <div className="flex">
                                <Button size="xs" className="mr-2">
                                    <FaStar className="mr-2 h-5 w-5" /> {packageData.stars}
                                </Button>
                                <Button size="xs" color="blue">
                                    <FaDownload className="mr-2 h-5 w-5" /> Download
                                </Button>
                            </div>
                        </div>
                    </Card>
                    <div className="flex space-x-4">
                        {packageData.files && packageData.files.length > 0 ? (
                            <>
                                <Card className="w-3/4 rounded-xl shadow-md dark:bg-gray-800 text-white">
                                    <Table hoverable>
                                        <Table.Body>
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
                                        </Table.Body>
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
                            </>
                        ) : (
                            <Card className="w-full rounded-xl shadow-md dark:bg-gray-800 p-4 text-white">
                                <p className="mb-2 font-bold">Quick setup — if you’ve done this kind of thing before</p>
                                <Card className="p-4 bg-gray-800 rounded mb-4">
                                    <p className="mt-2">Get started by creating a new file or uploading an existing file. We recommend every repository include a README, LICENSE, and .gitignore.</p>
                                </Card>
                                <p className="mb-2 font-bold">...or create a new repository on the command line</p>
                                <Card className="p-4 bg-gray-800 rounded">
                                    <pre className="text-sm text-left whitespace-pre-wrap">
                                        <code className="whitespace-pre">
                                            echo "# test" README.md<br />
                                            git init<br />
                                            git add README.md<br />
                                            git commit -m "first commit"<br />
                                            git branch -M main<br />
                                            git remote add origin https://github.com/Nexeum/test.git<br />
                                            git push -u origin main<br />
                                        </code>
                                    </pre>
                                </Card>
                                <p className="mt-4 mb-2 font-bold">...or push an existing repository from the command line</p>
                                <Card className="p-4 bg-gray-800 rounded">
                                    <pre className="text-sm text-left whitespace-pre-wrap">
                                        <code className="whitespace-pre">
                                            git remote add origin https://github.com/Nexeum/test.git<br />
                                            git branch -M main<br />
                                            git push -u origin main<br />
                                        </code>
                                    </pre>
                                </Card>
                            </Card>
                        )}
                    </div>
                </Card>
            )}
        </div >
    );
};