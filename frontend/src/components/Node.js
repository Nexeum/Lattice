import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Button, Modal, Table } from "flowbite-react";
import { useParams } from 'react-router-dom';
import { Cli } from './Cli';
import { Graph } from './Graph';

export const Node = () => {
    const { roomId, nodeId } = useParams();
    const [room, setRoom] = useState(null);
    const [openModalChangeNode, setOpenModalChangeNode] = useState(false);
    const [nodes, setNodes] = useState([]);
    const [links, setLinks] = useState([]);
    const [orchestratorIP, setOrchestratorIP] = useState('');

    useEffect(() => {

        axios.get(`http://10.8.8.247:5001/container/${roomId}/ip`)
        .then(response => {
          setOrchestratorIP(response.data.ip_address);
          console.log(response.data.ip_address);
        })
        .catch(error => {
          console.error(error);
        });

        axios.get(`http://10.8.8.247:5001/containers/${roomId}/ps`)
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

    return (
        <div className="flex flex-col p-8">
            <Card className="w-full space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {nodeId ? nodeId + " - Node" : 'Loading...'}
                    </h2>
                    <div className="flex space-x-4">
                        <Button onClick={() => {
                            setOpenModalChangeNode(true);
                        }}>Change Node</Button>
                    </div>
                </div>

                <div className="flex space-x-4">
                    <div className="flex w-full">
                        <Cli />
                    </div>
                </div>
            </Card>
            <Modal show={openModalChangeNode} onClose={() => setOpenModalChangeNode(false)}>
                <Modal.Header>Change Node</Modal.Header>
                <Modal.Body>
                    <Graph nodes={nodes} orchestratorIP={orchestratorIP}/>
                </Modal.Body>
            </Modal>
        </div>
    );
};