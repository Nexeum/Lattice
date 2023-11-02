import React, { useState } from "react";
import { Card, Button } from "flowbite-react";

export const DockerRoomCard = ({ roomName, isPublic, onStateChange }) => {
  const [publicState, setPublicState] = useState(isPublic);

  const handleStateChange = () => {
    setPublicState(!publicState);
    onStateChange(roomName);
  };

  return (
    <Card className="space-y-4 rounded-xl shadow-md dark:bg-gray-800">
      <div className="flex flex-col h-full p-4">
        <h2 className="text-xl mb-2 text-white">{roomName}</h2>
        <p className="mb-2 text-white">{publicState ? "Public" : "Private"}</p>
        <Button className="mt-auto m-4">Join</Button>
        <Button onClick={handleStateChange} className="mt-auto m-4">
          Change to {publicState ? "Private" : "Public"}
        </Button>
      </div>
    </Card>
  );
};

export const KubeSh = () => {
  const rooms = [
    { name: "Room 1", isPublic: true },
    { name: "Room 2", isPublic: false },
    { name: "Room 3", isPublic: true },
    { name: "Room 4", isPublic: true },
    { name: "Room 5", isPublic: true },
    { name: "Room 6", isPublic: true }
  ];

  const handleRoomStateChange = (roomName) => {
    console.log(`Room state changed for ${roomName}`);
  };

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Rooms
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {rooms.map((room) => (
            <DockerRoomCard
              key={room.name}
              roomName={room.name}
              isPublic={room.isPublic}
              onStateChange={handleRoomStateChange}
            />
          ))}
        </div>
      </Card>
    </div>
  );
};
