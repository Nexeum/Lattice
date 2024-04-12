import React, { useState, useEffect } from "react";
import { Card, Button, Modal, TextInput, Label, Select } from "flowbite-react";
import axios from 'axios';
import { useHistory } from "react-router-dom";

export const DockerRoomCard = ({ roomId, roomName, isPublic, onStateChange, onJoin, owner, currentUserId, setRooms, rooms }) => {
  const [changeRoomId, setChangeRoomId] = useState(null);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [password, setPassword] = useState('');

  const handleStateChange = async (roomId, isPublic) => {
    if (isPublic) {
      setChangeRoomId(roomId);
      setChangePasswordModal(true);
    } else {
      const room = {
        is_private: false,
        password: ''
      };
      updateRoom(roomId, room);
    }
  };

  const handleJoin = () => {
    onJoin(roomId);
  };

  const updateRoom = async (roomId, room) => {
    console.log(roomId);
    try {
      const response = await axios.put(`http://10.8.8.247:5002/rooms/${roomId}`, room);
      if (response.data) {
        setRooms(rooms.map(r => r._id === roomId ? { ...r, ...response.data } : r));
      }
    } catch (error) {
      console.error('There was an error!', error);
    }
  };

  const handleChangePasswordSubmit = () => {
    const room = {
      is_private: true,
      password: password
    };
    updateRoom(changeRoomId, room);
    setChangePasswordModal(false);
  };

  return (
    <>
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
          {currentUserId === owner && (
            <Button onClick={() => handleStateChange(roomId, isPublic)} className="mt-auto m-4">
              Change to {isPublic ? "Private" : "Public"}
            </Button>
          )}
        </div>
      </Card>
      <Modal show={changePasswordModal} onClose={() => setChangePasswordModal(false)}>
        <Modal.Header>Enter Password</Modal.Header>
        <Modal.Body>
          <Label htmlFor="password">Password</Label>
          <TextInput id="password" type="password" label="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleChangePasswordSubmit}>Submit</Button>
          <Button color="gray" onClick={() => setChangePasswordModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </>
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
  const [currentUserId, setCurrentUserId] = useState(null);
  const history = useHistory();

  useEffect(() => {
    axios.get('http://10.8.8.247:5002/rooms')
      .then(response => {
        setRooms(response.data);
      })
      .catch(error => {
        console.error('There was an error!', error);
      });

    const fetchUserId = async () => {
      const token = localStorage.getItem("token");
      const userId = await getUserId(token);
      setCurrentUserId(userId);
    };

    fetchUserId();
  }, []);

  const getUserId = async (token) => {
    try {
      const response = await axios.get("http://127.0.0.1:8000/getuserid", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return JSON.parse(response.data).data;
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const createRoom = async (room) => {
    try {
      const response = await axios.post('http://10.8.8.247:5002/rooms', room);
      return response.data;
    } catch (error) {
      console.error('There was an error!', error);
      return null;
    }
  };

  const handleCreateRoom = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      const userId = await getUserId(token);
      if (userId) {
        const room = {
          name: roomName,
          is_private: isPrivate === 'private',
          password: password,
          owner: userId
        };
        const newRoom = await createRoom(room);
        if (newRoom) {
          setRooms([...rooms, newRoom]);
          setOpenModal(false);
        }
      }
    }
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
            Workspace
          </h2>
          <Button onClick={() => setOpenModal(true)}>Create Workspace</Button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {rooms.length > 0 ? rooms.map((room) => (
            <DockerRoomCard
              key={room._id}
              roomId={room._id}
              roomName={room.name}
              isPublic={!room.is_private}
              owner={room.owner}
              currentUserId={currentUserId}
              onJoin={() => handleJoinRoom(room._id, !room.is_private)}
              onStateChange={() => handleStateChange(room._id, !room.is_private)}
              setRooms={setRooms}
              rooms={rooms}
            />
          )) : <p className="text-white">No rooms available. Create one?</p>}
        </div>
      </Card>
      <Modal show={openModal} onClose={() => setOpenModal(false)}>
        <Modal.Header>Create a Workspace</Modal.Header>
        <Modal.Body>
          <Label htmlFor="rm">Workspace name</Label>
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
