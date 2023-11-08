import React, { useState, useEffect } from "react";
import { Table, Card, Button } from "flowbite-react";

export const Dashboard = () => {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setAuthenticated(true);
    }
  }, []);

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Trending Add-Ons
          </h2>
          <Button>Create Add-Ons</Button>
        </div>
        <Table hoverable>
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
      </Card >
    </div >
  );
};
