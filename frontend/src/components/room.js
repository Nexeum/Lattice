import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Button, Modal, TextInput, Label, Textarea } from "flowbite-react";
import { useParams } from 'react-router-dom';
import { Cli } from './Cli';
import { Graph } from './Graph';

export const Room = () => {
  const { id } = useParams();
  const [room, setRoom] = useState(null);
  const [openModalCreate, setOpenModalCreate] = useState(false);
  const [openModalChangeNode, setOpenModalChangeNode] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [containerImage, setContainerImage] = useState('');
  const [containerShell, setContainerShell] = useState('');
  const [creationResult, setCreationResult] = useState('');
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [orchestratorIP, setOrchestratorIP] = useState('');

  useEffect(() => {
    axios.get(`http://10.8.8.247:5002/rooms/${id}`)
      .then(response => {
        setRoom(response.data);
      })
      .catch(error => {
        console.error(error);
      });

    axios.get(`http://10.8.8.247:5001/container/${id}/ip`)
      .then(response => {
        setOrchestratorIP(response.data.ip_address);
        console.log(response.data.ip_address);
      })
      .catch(error => {
        console.error(error);
      });

    axios.get(`http://10.8.8.247:5001/containers/${id}/ps`)
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
  }, [id]);

  const createContainer = () => {
    axios.get(`http://10.8.8.247:5001/container/${id}/${containerName}/${containerImage}/${containerShell}`)
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
            {room ? room.name + " - Orchestrator" : 'Loading...'}
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
      <Modal show={openModalChangeNode} onClose={() => setOpenModalChangeNode(false)}>
        <Modal.Header>Change Node</Modal.Header>
        <Modal.Body>
          <Graph nodes={nodes} orchestratorIP={orchestratorIP} />
        </Modal.Body>
      </Modal>
      <Modal show={openModalCreate} onClose={() => setOpenModalCreate(false)}>
        <Modal.Header>Create a Container</Modal.Header>
        <Modal.Body>
          <Label htmlFor="name">Container Name</Label>
          <TextInput id="name" value={containerName} onChange={e => setContainerName(e.target.value)} />
          <Label htmlFor="image">Container Image</Label>
          <TextInput id="image" value={containerImage} onChange={e => setContainerImage(e.target.value)} />
          <Label htmlFor="shell">Shell</Label>
          <TextInput id="shell" value={containerShell} onChange={e => setContainerShell(e.target.value)} />
          <Textarea className='text-white text-center mt-4' disabled value={creationResult} />
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
          <Graph nodes={nodes} orchestratorIP={orchestratorIP} />
        </Modal.Body>
      </Modal>
    </div>
  );
};