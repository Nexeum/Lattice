import React, { useState, useRef, useEffect } from "react";
import { Button, TextInput } from "flowbite-react";
import axios from 'axios';
import { useParams } from 'react-router-dom';

export const Cli = () => {
  const { id } = useParams();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const outputEndRef = useRef(null);

  const handleInputChange = (event) => {
    setInput(event.target.value);
  };

  const handleCommandSubmit = async (event) => {
    event.preventDefault();
    const response = await axios.post(
      `http://localhost:5001/exe/${id}/${encodeURIComponent(input)}`
    );
    setOutput(response.data.output);
    setInput("");
  };

  useEffect(() => {
    outputEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  return (
    <div className="w-full space-y-4 flex flex-col bg-gray-900 text-white overflow-auto p-4 rounded-lg shadow-lg">
      <div className="flex-grow flex min-h-[500px]">
        <pre className="whitespace-pre-wrap flex-grow">{output}</pre>
        <div ref={outputEndRef}></div>
      </div>
      <form onSubmit={handleCommandSubmit} className="flex-none">
        <div className="flex">
          <TextInput
            type="text"
            value={input}
            onChange={handleInputChange}
            className="w-full bg-gray-800 text-white rounded-lg shadow-inner"
          />
          <Button type="submit" className="ml-2 bg-green-500 hover:bg-green-600 text-white rounded-lg shadow-lg">
            Execute
          </Button>
        </div>
      </form>
    </div>
  );
};