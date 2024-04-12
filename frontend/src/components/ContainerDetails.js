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
  const [overloadData, setOverloadData] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [graphData, setGraphData] = useState({});

  const startLoadTest = () => {
    setOpenModal(true);
    axios.get(`http://10.8.8.247:5001/container/${id}/overload`)
      .then(response => {
        setOverloadData(response.data);
      })
      .catch(error => {
        console.error(error);
      });
  };


  useEffect(() => {
    const intervalId = setInterval(() => {
      axios.get(`http://10.8.8.247:5001/container/${id}/metrics`)
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

  const dataMemUsage = {
    labels: ['MemUsage'],
    datasets: [
      {
        label: 'MemUsage in MiB',
        data: [memUsage],
        backgroundColor: ['rgba(70, 130, 180, 0.5)'],
        borderColor: ['rgba(70, 130, 180, 1)'],
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

  const dataOverload = {
    labels: Object.keys(overloadData),
    datasets: [
      {
        label: 'Response Time (s)',
        data: Object.values(overloadData),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
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
        <Button onClick={startLoadTest}>Start Load Test</Button>
        <Modal show={openModal} onClose={() => setOpenModal(false)}>
          <Modal.Header>Overload Test Results</Modal.Header>
          <Modal.Body>
            <Line data={dataOverload} options={options} />
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={() => setOpenModal(false)}>Close</Button>
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
