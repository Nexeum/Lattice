import React, { useState, useCallback, useEffect } from "react";
import { Card, Button, TextInput } from "flowbite-react";
import axios from "axios";

const userImageURL = "https://th.bing.com/th/id/OIG.q3iFkMBl3odPVneKCIWg?pid=ImgGn";
const aiImageURL = "https://cdn-icons-png.flaticon.com/128/1344/1344707.png";

export const Tars = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [suggestions, setSuggestions] = useState([
    "How can I get started with Docker?",
    "Give me an example of a Dockerfile for a simple Python app?",
    "How does Docker simplify application deployment?",
    "How do I install Docker on Linux?",
  ]);

  const fetchAnswer = async (question) => {
    try {
      const response = await axios.get(`http://10.8.8.247:5004/ask`, {
        params: { question }
      });
      return response.data.answer;
    } catch (error) {
      console.error("Error fetching answer", error);
      return "Sorry, I couldn't process your request.";
    }
  };

  const handleSend = useCallback(async () => {
    if (input) {
      setInput("");
      setSuggestions([]);

      const newMessage = { text: input, sender: "user" };
      setMessages((prevMessages) => [...prevMessages, newMessage]);

      const answer = await fetchAnswer(input);

      const typingMessage = { text: "", sender: "ai" };
      setMessages((prevMessages) => [...prevMessages, typingMessage]);

      let currentMessage = "";

      for (let i = 0; i < answer.length; i++) {
        currentMessage += answer[i];
        typingMessage.text = currentMessage;

        await new Promise((resolve) => setTimeout(resolve, 50));

        setMessages((prevMessages) => [...prevMessages]);
      }

      setMessages((prevMessages) => [
        ...prevMessages.filter((message) => message !== typingMessage),
        { text: currentMessage, sender: "ai" },
      ]);
    }
  }, [input]);

  const handleSuggestionClick = useCallback(async (suggestion) => {
    setInput(suggestion);
    setSuggestions([]);
    setInput("");
    const answer = await fetchAnswer(suggestion);

    const newMessage = { text: suggestion, sender: "user" };
    setMessages((prevMessages) => [...prevMessages, newMessage]);

    const typingMessage = { text: "", sender: "ai" };
    setMessages((prevMessages) => [...prevMessages, typingMessage]);

    let currentMessage = "";

    for (let i = 0; i < answer.length; i++) {
      currentMessage += answer[i];
      typingMessage.text = currentMessage;

      await new Promise((resolve) => setTimeout(resolve, 50));

      setMessages((prevMessages) => [...prevMessages]);
    }

    setMessages((prevMessages) => [
      ...prevMessages.filter((message) => message !== typingMessage),
      { text: currentMessage, sender: "ai" },
    ]);
  }, []);

  useEffect(() => {
    setSuggestions([
      "How can I get started with Docker?",
      "Give me an example of a Dockerfile for a simple Python app?",
      "How does Docker simplify application deployment?",
      "How do I install Docker on Linux?",
    ]);
  }, []);

  return (
    <div className="flex flex-col p-8">
      <Card className={`w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800 ${messageSent ? '' : 'card-with-watermark'} relative`}>
        <div className="d-flex flex-col h-100 z-10 relative">
          <div className="overflow-auto mb-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`${
                  message.sender === "user" ? "self-end" : "self-start"
                }`}
              >
                <Card
                  className={`mb-2 ${
                    message.sender === "user" ? "bg-primary text-white" : "text-white"
                  }`}
                >
                  <div className="flex items-center">
                    {message.sender === "user" && (
                      <img src={userImageURL} alt="User" className="w-8 h-8 mr-2 rounded-full" />
                    )}
                    {message.sender === "ai" && (
                      <img src={aiImageURL} alt="AI" className="w-8 h-8 mr-2 rounded-full" />
                    )}
                    {message.text}
                  </div>
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
