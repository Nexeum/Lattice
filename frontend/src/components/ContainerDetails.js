import React, { useEffect, useState } from 'react';
import axios from "axios";
import { Card, Button, Modal } from "flowbite-react";
import { useParams } from 'react-router-dom';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export const ContainerDetails = () => {
  const { id } = useParams();
  const [memUsage, setMemUsage] = useState(0);
  const [cpuPercData, setCpuPercData] = useState([]);
  const [memPerc, setMemPerc] = useState(0);
  const [timestamps, setTimestamps] = useState([]);
  const [concurrentClients, setConcurrentClients] = useState(0);
  const [averageResponseTime, setAverageResponseTime] = useState(0);
  const [qps, setQps] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [overloadData, setOverloadData] = useState({});

  const startLoadTest = () => {
    setShowModal(true);
  };

  useEffect(() => {
    const intervalId = setInterval(() => {
      axios.get(`http://localhost:5001/container/${id}/metrics`)
        .then(response => {
          setMemUsage(parseMemUsage(response.data.MemUsage));
          setCpuPercData(prevData => {
            const newData = [...prevData, parsePercentage(response.data.CPUPerc)];
            return newData.length > 8 ? newData.slice(1) : newData;
          });
          setMemPerc(parsePercentage(response.data.MemPerc));
          setTimestamps(prevTimestamps => {
            const newTimestamps = [...prevTimestamps, new Date().toLocaleTimeString()];
            return newTimestamps.length > 8 ? newTimestamps.slice(1) : newTimestamps;
          });
        })
        .catch(error => {
          console.error(error);
        });
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [id]);

  useEffect(() => {
    const calculatedConcurrentClients = qps * averageResponseTime;
    setConcurrentClients(calculatedConcurrentClients);

    axios.get(`http://localhost:5001/container/${id}/aprox`)
      .then(response => {
        const roundedAverageResponseTime = Math.round(response.data.averageResponseTime * 100) / 100;
        const roundedQps = Math.round(response.data.qps);
        setAverageResponseTime(roundedAverageResponseTime);
        setQps(roundedQps);
      })
      .catch(error => {
        console.error(error);
      });
  }, [id, qps, averageResponseTime]);

  const dataMemUsage = {
    labels: ['MemUsage'],
    datasets: [
      {
        label: 'MemUsage in MiB',
        data: [memUsage],
        backgroundColor: ['rgba(75, 192, 192, 0.2)'],
        borderColor: ['rgba(75, 192, 192, 1)'],
        borderWidth: 1,
      },
    ],
  };

  const dataCpuPerc = {
    labels: timestamps,
    datasets: [
      {
        label: 'CPU Usage in %',
        data: cpuPercData,
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
    ],
  };

  const dataMemPerc = {
    labels: ['MemPerc'],
    datasets: [
      {
        label: 'Memory Usage in %',
        data: [memPerc],
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(255, 159, 64, 0.2)',
          'rgba(255, 205, 86, 0.2)',
          'rgba(75, 192, 192, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(153, 102, 255, 0.2)',
          'rgba(201, 203, 207, 0.2)'
        ],
        hoverOffset: 4
      },
    ],
  };

  const options = {
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const dataOverload = {
    labels: ['p99', 'p95', 'p90', 'mean', 'max', 'min'],
    datasets: [
      {
        label: 'Overload',
        data: Object.values(overloadData),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
    ],
  };

  return (
    <div className="flex flex-col p-8">
      <Card className="w-full space-y-4 rounded-xl shadow-md dark:bg-gray-800">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Metrics Container {id}
        </h2>

        <div className="flex flex-col md:flex-row flex-wrap space-x-4 w-full">
          <Card className="flex-grow space-y-4 rounded-xl shadow-md dark:bg-gray-800">
            <Bar data={dataMemUsage} options={options} />
          </Card>
          <Card className="flex-grow space-y-4 rounded-xl shadow-md dark:bg-gray-800">
            <Line data={dataCpuPerc} options={options} />
          </Card>
          <Card className="flex-grow space-y-4 rounded-xl shadow-md dark:bg-gray-800">
            <Doughnut data={dataMemPerc} options={options} />
          </Card>
        </div>
        <div className="w-full">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            Performance Test Aprox
          </h1>
          <Card className="flex-grow space-y-4 rounded-xl shadow-md dark:bg-gray-800">
            <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Concurrent Clients: {concurrentClients}
            </h3>
            <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Average Response Time: {averageResponseTime} seconds
            </h3>
            <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Queries Per Second: {qps}
            </h3>
            <Button onClick={startLoadTest}>Start Load Test</Button>
          </Card>
        </div>
        <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
          <Modal.Header>Overload Data</Modal.Header>
          <Modal.Body>
            <Line data={dataOverload} options={options} />
          </Modal.Body>
          <Modal.Footer>
            <Button color="red" onClick={() => setShowModal(false)}>Close</Button>
          </Modal.Footer>
        </Modal>
      </Card>
    </div>
  );
};

function parseMemUsage(memUsage) {
  const [usedMemory] = memUsage.split(' / ');
  return parseFloat(usedMemory);
}

function parsePercentage(percentage) {
  return parseFloat(percentage);
}
