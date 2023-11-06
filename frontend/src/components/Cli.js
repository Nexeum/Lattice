import React, { useState, useRef, useEffect } from "react";
import { Textarea, Card, TextInput  } from "flowbite-react";

export const Cli = () => {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("C:/");
  const outputEndRef = useRef(null);

  const handleInputChange = (event) => {
    setInput(event.target.value);
  };

  const handleCommandSubmit = (event) => {
    event.preventDefault();
    if (input === "help") {
      setOutput((prevOutput) => prevOutput + "\n" + "Comandos de ayuda: \n- comando1: hace esto \n- comando2: hace aquello");
    } else {
      setOutput((prevOutput) => prevOutput + "\nC:/" + input);
    }
    setInput("");
  };

  useEffect(() => {
    outputEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  return (
      <Card className="w-full space-y-4 border-0">
        <div className="flex flex-col h-64 bg-black text-white overflow-auto p-4">
          <div className="flex-grow">
            <pre className="whitespace-pre-wrap">{output}</pre>
            <div ref={outputEndRef}></div>
          </div>
          <form onSubmit={handleCommandSubmit}>
            <TextInput 
              type="text"
              value={input}
              onChange={handleInputChange}
              className="w-full bg-black text-white"
            />
          </form>
        </div>
      </Card>
  );
};
