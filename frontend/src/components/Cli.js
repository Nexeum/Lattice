import React, { useState, useRef, useEffect } from "react";
import { Terminal, Play, Copy, Minimize2, Maximize2, X } from "lucide-react";

export const Cli = () => {
  // Get ID from URL
  let id;
  let out;
  const pathSegments = window.location.pathname.split('/');
  
  if (pathSegments.length >= 2) {
    out = pathSegments[2];
  }
  id = pathSegments[pathSegments.length - 1];
  
  const [input, setInput] = useState("");
  const [output, setOutput] = useState(`Innoxus Shell [🔧 Version 1.0.1 | Security Patch | Build 002]
(c) 2025 Innoxus Corporation. All rights reserved.

Welcome to Innoxus Container Shell
Type 'help' for available commands.

`);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const outputEndRef = useRef(null);
  const inputRef = useRef(null);

  const handleInputChange = (event) => {
    setInput(event.target.value);
  };

  const handleCommandSubmit = async () => {
    if (!input.trim()) return;
    
    const command = input.trim();
    setOutput(prevOutput => `${prevOutput}$ ${command}\n`);
    
    try {
      // Simulate command execution
      await new Promise(resolve => setTimeout(resolve, 300));
      
      let commandOutput = "";
      
      // Mock command responses
      switch (command.toLowerCase()) {
        case 'help':
          commandOutput = `Available commands:
  ls          - List directory contents
  ps          - Show running processes  
  docker ps   - List Docker containers
  top         - Display system processes
  clear       - Clear the terminal
  exit        - Exit the terminal
  pwd         - Print working directory
  whoami      - Show current user`;
          break;
        case 'ls':
          commandOutput = `total 48
drwxr-xr-x  3 root root  4096 Jan 28 10:30 app
-rw-r--r--  1 root root   156 Jan 28 10:25 config.json
-rw-r--r--  1 root root  1024 Jan 28 10:20 docker-compose.yml
drwxr-xr-x  2 root root  4096 Jan 28 10:15 logs
-rwxr-xr-x  1 root root  2048 Jan 28 10:10 start.sh`;
          break;
        case 'ps':
        case 'docker ps':
          commandOutput = `CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS
1a2b3c4d5e6f   nginx:alpine   "/docker-entrypoint.…"   2 hours ago     Up 2 hours
7g8h9i0j1k2l   redis:latest   "docker-entrypoint.s…"   3 hours ago     Up 3 hours
m9n8o7p6q5r4   postgres:13    "docker-entrypoint.s…"   1 day ago       Up 1 day`;
          break;
        case 'pwd':
          commandOutput = '/usr/src/app';
          break;
        case 'whoami':
          commandOutput = 'root';
          break;
        case 'top':
          commandOutput = `Tasks: 25 total,   1 running,  24 sleeping,   0 stopped,   0 zombie
%Cpu(s):  2.3 us,  1.1 sy,  0.0 ni, 96.6 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :   7982.4 total,   2156.7 free,   3421.2 used,   2404.5 buff/cache

  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
    1 root      20   0   80064  15472  11776 S   0.0   0.2   0:01.23 systemd`;
          break;
        case 'clear':
          setOutput(`Innoxus Shell [🔧 Version 1.0.1 | Security Patch | Build 002]
(c) 2025 Innoxus Corporation. All rights reserved.

Welcome to Innoxus Container Shell
Type 'help' for available commands.

`);
          setHistory(prevHistory => [...prevHistory, command]);
          setHistoryIndex(history.length + 1);
          setInput("");
          return;
        case 'exit':
          commandOutput = 'Connection closed by remote host.';
          break;
        default:
          if (command.startsWith('echo ')) {
            commandOutput = command.substring(5);
          } else {
            commandOutput = `bash: ${command}: command not found`;
          }
      }
      
      setOutput(prevOutput => `${prevOutput}${commandOutput}\n\n`);
      
    } catch (error) {
      setOutput(prevOutput => `${prevOutput}Error: Failed to execute command\n\n`);
    }
    
    setHistory(prevHistory => [...prevHistory, command]);
    setHistoryIndex(history.length + 1);
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
  };

  const clearTerminal = () => {
    setOutput(`Innoxus Shell [🔧 Version 1.0.1 | Security Patch | Build 002]
(c) 2025 Innoxus Corporation. All rights reserved.

Welcome to Innoxus Container Shell
Type 'help' for available commands.

`);
  };

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  // Focus input when terminal is clicked
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div className={`bg-black rounded-2xl shadow-lg border border-gray-300 transition-all duration-300 overflow-hidden ${
      isFullscreen ? 'fixed inset-4 z-50' : 'w-full'
    } ${isMinimized ? 'h-12' : 'h-[450px]'}`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 border-b border-gray-300">
        <div className="flex items-center space-x-3">
          {/* macOS-style window controls */}
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="w-3 h-3 bg-red-500 rounded-full hover:bg-red-400 transition-colors"
            >
            </button>
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="w-3 h-3 bg-yellow-500 rounded-full hover:bg-yellow-400 transition-colors"
            >
            </button>
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="w-3 h-3 bg-green-500 rounded-full hover:bg-green-400 transition-colors"
            >
            </button>
          </div>
          
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-800">
              Innoxus Terminal - Container {id}
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={copyToClipboard}
            className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-all duration-200"
            title="Copy output"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={clearTerminal}
            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-all duration-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      {!isMinimized && (
        <div 
          className="h-full flex flex-col"
          onClick={handleTerminalClick}
        >
          {/* Output Area */}
          <div className="flex-1 p-4 overflow-auto font-mono text-sm leading-relaxed">
            <pre className="text-green-400 whitespace-pre-wrap break-words">
              {output}
            </pre>
            <div ref={outputEndRef}></div>
          </div>

          {/* Input Area */}
          <div className="flex-shrink-0 px-4 pb-4">
            <div className="flex items-center space-x-2">
              <span className="text-green-400 font-mono text-sm flex-shrink-0">$</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleCommandSubmit();
                  } else {
                    handleKeyDown(event);
                  }
                }}
                className="flex-1 bg-transparent text-green-400 font-mono text-sm outline-none placeholder-green-600 min-w-0"
                placeholder="Enter command..."
                autoComplete="off"
                spellCheck="false"
              />
              <button
                onClick={handleCommandSubmit}
                className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-black rounded-lg transition-all duration-200 text-xs font-medium flex-shrink-0"
              >
                <Play className="w-3 h-3" />
                <span>Run</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};