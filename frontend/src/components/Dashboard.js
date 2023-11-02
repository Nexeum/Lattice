import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Table} from "flowbite-react";

export const Dashboard = () => {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setAuthenticated(true);
    }
  }, []);

  return (
    <div className="rounded-lg p-8">
      <div className="relative overflow-x-auto">
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>
              <div className="flex items-center space-x-2">
                <svg
                  className="w-6 h-6 text-gray-800 dark:text-white"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 18 16"
                >
                  <path
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M1 1v14h16m0-9-3-2-3 5-3-2-3 4"
                  />
                </svg>
                <span>Trending repositories</span>
              </div>
            </Table.HeadCell>
          </Table.Head>
          <Table.Body className="divide-y">
            <Table.Row className="bg-white dark:border-gray-700 dark:bg-gray-800">
              <Table.Cell>
                <h3 className="text-lg font-bold">THUDM/ChatGLM3</h3>
                <p className="text-sm text-gray-500">
                  ChatGLM3 series: Open Bilingual Chat LLMs |
                  开源双语对话语言模型
                </p>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Python</span>
                  <span className="text-sm text-gray-600">2.3k stars</span>
                </div>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </div>
    </div>
  );
};
