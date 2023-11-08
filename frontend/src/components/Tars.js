import React, { useState, useCallback } from "react";
import { Card, Button, TextInput } from "flowbite-react";

export const Tars = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [suggestions, setSuggestions] = useState([
    "How do I install Docker?",
    "How do I create a pod in Kubernetes?",
    "How do I scale an application in Kubernetes?",
    "How do I share data between Docker containers?",
  ]);

  const handleSend = useCallback(() => {
    if (input) {
      setMessages((prevMessages) => [
        ...prevMessages,
        { text: input, sender: "user" },
      ]);
      setInput("");
      setSuggestions([]);
      setMessageSent(true);
    }
  }, [input]);

  const handleSuggestionClick = useCallback((suggestion) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { text: suggestion, sender: "user" },
    ]);
    setSuggestions([]);
  }, []);

  return (
    <div className="flex flex-col p-8">
      <Card className={`w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800 ${messageSent ? '' : 'card-with-watermark'} relative`}>
        <div className="d-flex flex-col h-100 z-10 relative">
          <div className="overflow-auto mb-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`text-${
                  message.sender === "user" ? "end" : "start"
                }`}
              >
                <Card
                  className={`mb-2 ${
                    message.sender === "user" ? "bg-primary text-white" : ""
                  }`}
                >
                  {message.text}
                </Card>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 mt-96">
            {suggestions.map((suggestion, index) => (
              <Card
                key={index}
                className="space-y-4 rounded-xl shadow-md dark:bg-gray-800"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <h6 className="text-base mb-2 text-white">{suggestion}</h6>
              </Card>
            ))}
          </div>
          <div className="mt-auto d-flex align-items-center justify-content-between">
            <div className="flex mt-auto items-center justify-between">
              <TextInput
                className="flex-grow mr-4"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message"
                onKeyPress={(event) =>
                  event.key === "Enter" ? handleSend() : null
                }
              />
              <Button onClick={handleSend}>Send</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
