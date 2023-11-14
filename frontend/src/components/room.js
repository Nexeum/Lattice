import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Button, Modal, TextInput, Label, Badge, Spinner, Table } from "flowbite-react";
import { useParams } from 'react-router-dom';
import { Cli } from './Cli';
import { Graph } from './Graph';

export const Room = () => {
  const { id } = useParams();
  const [room, setRoom] = useState(null);
  const [openModalChangeNode, setOpenModalChangeNode] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);

  useEffect(() => {
    axios.get(`http://localhost:5002/rooms/${id}`)
      .then(response => {
        setRoom(response.data);
      })
      .catch(error => {
        console.error(error);
      });

    axios.get(`http://localhost:5001/containers/${id}/ps`)
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
          <Graph nodes={nodes} links={links} />
        </Modal.Body>
      </Modal>
    </div>
  );
};