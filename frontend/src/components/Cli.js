import React, { useState, useRef, useEffect } from "react";
import { Button, TextInput } from "flowbite-react";
import axios from 'axios';
import { useParams } from 'react-router-dom';

export const Cli = () => {
  const { id } = useParams();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("Innoxus Shell [🔧 Version 1.0.1 | Security Patch | Build 002].\n(c) Innoxus. All rights reserved.\n");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const outputEndRef = useRef(null);

  const handleInputChange = (event) => {
    setInput(event.target.value);
  };

  const handleCommandSubmit = async (event) => {
    event.preventDefault();
    const command = input;
    const response = await axios.post(
      `http://localhost:5001/exe/${id}/${encodeURIComponent(command)}`
    );
    setOutput(prevOutput => `${prevOutput}\n$ ${command}\n${response.data.output}`);
    setHistory(prevHistory => [...prevHistory, command]);
    setHistoryIndex(history.length);
    setInput("");
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const newIndex = event.key === 'ArrowUp'
        ? Math.max(historyIndex - 1, 0)
        : Math.min(historyIndex + 1, history.length);
      setHistoryIndex(newIndex);
      setInput(history[newIndex] || "");
    }
  };

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  return (
    <div className="w-full space-y-4 flex flex-col bg-gray-900 text-white overflow-auto p-4 rounded-lg shadow-lg">
      <div className="flex-grow overflow-auto flex  min-h-[550px]" style={{ maxHeight: '550px' }}>
        <pre className="whitespace-pre-wrap flex-grow overflow-y-auto">{output}</pre>
        <div ref={outputEndRef}></div>
      </div>
      <form onSubmit={handleCommandSubmit} className="flex-none">
        <div className="flex text-center">
          <TextInput
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
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
