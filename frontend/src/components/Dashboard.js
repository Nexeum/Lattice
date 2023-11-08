import React, { useState, useEffect } from "react";
import { Table, Card, Button, Modal, Label, TextInput } from "flowbite-react";
import { useHistory } from "react-router-dom";
import axios from 'axios';

export const Dashboard = () => {
  const [openModal, setOpenModal] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [description, setDescription] = useState("");
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    const fetchPackages = async () => {
      const response = await axios.get('http://localhost:5003/packages');
      setPackages(response.data);
    };
    fetchPackages();
  }, []);
  
  const history = useHistory();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await axios.post('http://localhost:5003/packages', {
      name: packageName,
      description: description,
      language: "Not Recognized",
      stars: 0
    });
    const data = response.data;
    console.log(data);
    setOpenModal(false);
    setPackageName("");
    setDescription("");
    history.push(`/package/${data._id}`);
  }

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Packages
          </h2>
          <Button onClick={() => setOpenModal(true)}>Create Package</Button>
        </div>
        <Table hoverable>
          <Table.Body className="divide-y">
            {packages.length > 0 ? (
              packages.map((pkg) => (
                <Table.Row key={pkg._id} className="bg-white dark:border-gray-700 dark:bg-gray-800" onClick={() => history.push(`/package/${pkg._id}`)}>
                  <Table.Cell>
                    <h3 className="text-lg font-bold">{pkg.name}</h3>
                    <p className="text-sm text-gray-500">{pkg.description}</p>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{pkg.language}</span>
                      <span className="text-sm text-gray-600">{pkg.stars} stars</span>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row className="bg-white dark:border-gray-700 dark:bg-gray-800">
                <Table.Cell>
                  <p className="text-sm text-gray-500">No packages available. Do you want to create a package?</p>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </Card>
      <Modal show={openModal} onClose={() => setOpenModal(false)}>
        <Modal.Header>Create Add-On</Modal.Header>
        <Modal.Body>
          <Label htmlFor="pn">Package name</Label>
          <TextInput id="pn" name="pn" value={packageName} onChange={e => setPackageName(e.target.value)} />
          <Label htmlFor="de">Description</Label>
          <TextInput id="de" name="des" value={description} onChange={e => setDescription(e.target.value)} />
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleSubmit}>Create</Button>
          <Button color="gray" onClick={() => setOpenModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </div >
  );
};
