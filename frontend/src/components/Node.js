import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Button, Modal, TextInput, Label, Badge, Spinner, Table } from "flowbite-react";
import { useParams } from 'react-router-dom';
import { Cli } from './Cli';
import { Graph } from './Graph';

export const Node = () => {
    const { roomId, nodeId } = useParams();
    const [room, setRoom] = useState(null);
    const [openModalCreate, setOpenModalCreate] = useState(false);
    const [containerName, setContainerName] = useState('');
    const [containerImage, setContainerImage] = useState('');
    const [containerShell, setContainerShell] = useState('');
    const [containers, setContainers] = useState([]);
    const [creationResult, setCreationResult] = useState('');
    const [openModalChangeNode, setOpenModalChangeNode] = useState(false);
    const [nodes, setNodes] = useState([]);
    const [links, setLinks] = useState([]);

    useEffect(() => {
        axios.get(`http://localhost:5001/containers/${roomId}/ps`)
            .then(function (response) {
                const nodes = response.data.output.map(container => ({
                    id: container.ID,
                    name: container.Name,
                    image: container.Image,
                    status: container.Status,
                    ip: container.IP,
                }));
                setNodes(nodes);
                console.log(nodes);
                const links = [];
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        if (nodes[i].network === nodes[j].network) {
                            links.push({ source: nodes[i].id, target: nodes[j].id });
                        }
                    }
                }
                setLinks(links);
            })
            .catch(function (error) {
                console.error(error);
            });
    }, [roomId]);

    const createContainer = () => {
        axios.get(`http://localhost:5001/container/${roomId}/${containerName}/${containerImage}/${containerShell}`)
            .then(function (response) {
                setCreationResult("Container created successfully with output: " + response.data.output);
            })
            .catch(function (error) {
                console.error(error);
                setCreationResult("Failed to create container: " + error.message);
            });
    }

    return (
        <div className="flex flex-col p-8">
            <Card className="w-full space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {room ? room.name : 'Loading...'}
                    </h2>
                    <div className="flex space-x-4">
                        <Button onClick={() => {
                            setOpenModalChangeNode(true);
                        }}>Change Node</Button>
                        <Button onClick={() => setOpenModalCreate(true)}>Create Container</Button>
                    </div>
                </div>

                <div className="flex space-x-4">
                    <div className="flex w-full">
                        <Cli />
                    </div>
                </div>
            </Card>
            <Modal show={openModalCreate} onClose={() => setOpenModalCreate(false)}>
                <Modal.Header>Create a Container</Modal.Header>
                <Modal.Body>
                    <Label htmlFor="name">Container Name</Label>
                    <TextInput id="name" value={containerName} onChange={e => setContainerName(e.target.value)} />
                    <Label htmlFor="image">Container Image</Label>
                    <TextInput id="image" value={containerImage} onChange={e => setContainerImage(e.target.value)} />
                    <Label htmlFor="shell">Shell</Label>
                    <TextInput id="shell" value={containerShell} onChange={e => setContainerShell(e.target.value)} />
                    <p>{creationResult}</p>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={createContainer}>Create</Button>
                    <Button color="gray" onClick={() => setOpenModalCreate(false)}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>
            <Modal show={openModalChangeNode} onClose={() => setOpenModalChangeNode(false)}>
                <Modal.Header>Change Node</Modal.Header>
                <Modal.Body>
                    <Graph nodes={nodes} links={links} />
                </Modal.Body>
            </Modal>
        </div>
    );
};