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
    // Aquí puedes procesar el comando ingresado en el input
    if (input === "help") {
      setOutput((prevOutput) => prevOutput + "\n" + "Comandos de ayuda: \n- comando1: hace esto \n- comando2: hace aquello");
    } else {
      // Por ahora, simplemente agregamos el comando al output
      setOutput((prevOutput) => prevOutput + "\nC:/" + input);
    }
    setInput("");
  };

  // Esta función se encarga de hacer scroll hasta el final del output cada vez que cambia
  useEffect(() => {
    outputEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
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
    </div>
  );
};
