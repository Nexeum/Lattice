import React, { useState, useEffect } from "react";
import { Card, Button, Modal, TextInput, Label, Select } from "flowbite-react";
import axios from 'axios';
import { useHistory } from "react-router-dom";

export const DockerRoomCard = ({ roomId, roomName, isPublic, onStateChange, onJoin }) => {
  const handleStateChange = () => {
    onStateChange(roomName);
  };

  const handleJoin = () => {
    onJoin(roomId);
  };

  return (
    <Card className="space-y-4 rounded-xl shadow-md dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <h5 className="text-xl font-bold leading-none text-gray-900 dark:text-white">{roomName}</h5>
        <h5 className="text-sm font-medium text-cyan-600 dark:text-cyan-500">
          {isPublic ? "Public" : "Private"}
        </h5>
      </div>
      <div className="flex flex-col h-full p-4">
        <Button onClick={handleJoin} className="mt-auto m-4">
          Join
        </Button>
        <Button onClick={handleStateChange} className="mt-auto m-4">
          Change to {isPublic ? "Private" : "Public"}
        </Button>
      </div>
    </Card>
  );
};

export const Nodesly = () => {
  const [rooms, setRooms] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState('public');
  const [password, setPassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState(null);
  const history = useHistory();

  useEffect(() => {
    axios.get('http://localhost:5002/rooms')
      .then(response => {
        console.log(response.data);
        setRooms(response.data);
      })
      .catch(error => {
        console.error('There was an error!', error);
      });
  }, []);

  const handleCreateRoom = () => {
    const room = {
      name: roomName,
      is_private: isPrivate === 'private',
      password: password
    };
    axios.post('http://localhost:5002/rooms', room)
      .then(response => {
        setRooms([...rooms, response.data]);
        setOpenModal(false);
      })
      .catch(error => {
        console.error('There was an error!', error);
      });
  };

  const handleJoinRoom = (roomId, isPublic) => {
    if (isPublic) {
      history.push(`/room/${roomId}`);
    } else {
      setJoinRoomId(roomId);
      setPasswordModal(true);
    }
  };

  const handlePasswordSubmit = () => {
    const room = rooms.find(room => room._id === joinRoomId);
    if (room && room.password === password) {
      history.push(`/room/${joinRoomId}`);
    } else {
      alert('Incorrect password');
    }
  };

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Rooms
          </h2>
          <Button onClick={() => setOpenModal(true)}>Create Room</Button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {rooms.length > 0 ? rooms.map((room) => (
            <DockerRoomCard
              key={room._id}
              roomId={room._id}
              roomName={room.name}
              isPublic={!room.is_private}
              onJoin={() => handleJoinRoom(room._id, !room.is_private)}
            />
          )) : <p className="text-white">No rooms available. Create one?</p>}
        </div>
      </Card>
      <Modal show={openModal} onClose={() => setOpenModal(false)}>
        <Modal.Header>Create a Room</Modal.Header>
        <Modal.Body>
          <Label htmlFor="rm">Room name</Label>
          <TextInput id="rm" name="rm" value={roomName} onChange={e => setRoomName(e.target.value)} />
          <Label htmlFor="private">Type</Label>
          <Select id="private" value={isPrivate} onChange={e => setIsPrivate(e.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </Select>
          {isPrivate === 'private' && (
            <>
              <Label htmlFor="password">Password</Label>
              <TextInput id="password" type="password" label="Password" value={password} onChange={e => setPassword(e.target.value)} />
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleCreateRoom}>Create</Button>
          <Button color="gray" onClick={() => setOpenModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={passwordModal} onClose={() => setPasswordModal(false)}>
        <Modal.Header>Enter Password</Modal.Header>
        <Modal.Body>
          <Label htmlFor="password">Password</Label>
          <TextInput id="password" type="password" label="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handlePasswordSubmit}>Submit</Button>
          <Button color="gray" onClick={() => setPasswordModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
