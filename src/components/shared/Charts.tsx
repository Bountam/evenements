import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartData,
  ChartOptions
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

// Enregistrer les composants Chart.js requis
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

interface DoughnutChartProps {
  data: ChartData<'doughnut'>;
  title?: string;
}

export function DoughnutChart({ data, title }: DoughnutChartProps) {
  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#cbd5e1', // text-slate-300
          font: {
            family: 'Roboto',
            size: 11
          },
          padding: 12
        }
      },
      title: {
        display: !!title,
        text: title || '',
        color: '#ffffff',
        font: {
          family: 'Oswald',
          size: 14,
          weight: 'bold'
        },
        padding: { bottom: 10 }
      }
    }
  };

  return (
    <div className="w-full h-64 relative flex items-center justify-center">
      <Doughnut data={data} options={options} />
    </div>
  );
}

interface BarChartProps {
  data: ChartData<'bar'>;
  title?: string;
  horizontal?: boolean;
}

export function BarChart({ data, title, horizontal = false }: BarChartProps) {
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ('y' as const) : ('x' as const),
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Roboto', size: 10 }
        }
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Roboto', size: 10 }
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: !!title,
        text: title || '',
        color: '#ffffff',
        font: {
          family: 'Oswald',
          size: 14,
          weight: 'bold'
        },
        padding: { bottom: 10 }
      }
    }
  };

  return (
    <div className="w-full h-64 relative">
      <Bar data={data} options={options} />
    </div>
  );
}
