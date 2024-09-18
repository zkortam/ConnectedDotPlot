import {
  AppliedPrompts,
  Context,
  onDrillDownFunction,
  ResponseData,
  TContext
} from '@incorta-org/component-sdk';
import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js';
import 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register the zoom plugin
Chart.register(zoomPlugin);

// Define a type for the component settings
interface ComponentSettings {
  dotColorOne?: string;
  dotColorTwo?: string;
  positiveLineColor?: string;
  negativeLineColor?: string;
  sortingStyle?: string;
}

interface Props {
  context: Context<TContext>;
  prompts: AppliedPrompts;
  data: ResponseData;
  drillDown: onDrillDownFunction;
}

const ConnectedDotPlot: React.FC<Props> = ({ context, prompts, data, drillDown }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const [sortedData, setSortedData] = useState(data.data);
  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);

  const settings = context?.component?.settings as ComponentSettings;
  const sortingStyle = settings?.sortingStyle || 'Original';
  const dotColorOne = settings?.dotColorOne || 'blue';
  const dotColorTwo = settings?.dotColorTwo || 'orange';
  const positiveLineColor = settings?.positiveLineColor || 'green';
  const negativeLineColor = settings?.negativeLineColor || 'red';

  const handleSort = () => {
    let sorted = data.data; // Default value
    switch (sortingStyle) {
      case 'Descending':
        sorted = [...data.data].sort((a, b) => {
          const minA = Math.min(Number(a[1]?.value) || 0, Number(a[2]?.value) || 0);
          const minB = Math.min(Number(b[1]?.value) || 0, Number(b[2]?.value) || 0);
          return minB - minA; // Descending
        });
        break;
      case 'Ascending':
        sorted = [...data.data].sort((a, b) => {
          const minA = Math.min(Number(a[1]?.value) || 0, Number(a[2]?.value) || 0);
          const minB = Math.min(Number(b[1]?.value) || 0, Number(b[2]?.value) || 0);
          return minA - minB; // Ascending
        });
        break;
      case 'DifferenceAscending':
        sorted = [...data.data].sort((a, b) => {
          const diffA = Math.abs((Number(a[2]?.value) || 0) - (Number(a[1]?.value) || 0));
          const diffB = Math.abs((Number(b[2]?.value) || 0) - (Number(b[1]?.value) || 0));
          return diffA - diffB; // Difference Ascending
        });
        break;
      case 'DifferenceDescending':
        sorted = [...data.data].sort((a, b) => {
          const diffA = Math.abs((Number(a[2]?.value) || 0) - (Number(a[1]?.value) || 0));
          const diffB = Math.abs((Number(b[2]?.value) || 0) - (Number(b[1]?.value) || 0));
          return diffB - diffA; // Difference Descending
        });
        break;
      default:
        sorted = data.data; // Original order
    }
    setSortedData(sorted);
    return undefined; // Ensure all paths return undefined
  };

  const formatNumber = (value: number): string => {
    if (value >= 1_000_000) {
      return `${Math.round(value / 1_000_000)}M`;
    } else if (value >= 1_000) {
      return `${Math.round(value / 1_000)}K`;
    } else {
      return `${Math.round(value)}`;
    }
  };

  useEffect(() => {
    handleSort();
  }, [sortingStyle, data.data]);

  useEffect(() => {
    if (chartRef.current && sortedData) {
      const labels = sortedData.map(row => row[0]?.value);

      const datasets = labels.map((label, index) => {
        const xValueOne = Number(sortedData[index][1]?.value) || 0;
        const xValueTwo = Number(sortedData[index][2]?.value) || 0;

        const difference = xValueTwo - xValueOne;

        return {
          label: `Line for ${label}`,
          data: [
            { x: xValueOne, y: label },
            { x: xValueTwo, y: label }
          ],
          backgroundColor: [dotColorOne, dotColorTwo],
          borderColor: difference > 0 ? positiveLineColor : negativeLineColor,
          borderWidth: 1,
          pointRadius: 5,
          showLine: true,
          fill: false
        };
      });

      const chartInstance = new Chart(chartRef.current, {
        type: 'scatter',
        data: {
          datasets: datasets,
        },
        options: {
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
            zoom: {
              pan: {
                enabled: true,
                mode: 'xy',
                threshold: 10,
              },
              zoom: {
                mode: 'xy',
                pinch: { enabled: true },
                wheel: { enabled: true, speed: 0.1 },
              },
            },
          },
          interaction: {
            mode: 'nearest',
            intersect: false,
          },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: { display: true, text: 'Cumulative Revenue ($)' },
              ticks: {
                autoSkip: false,
                callback: (value) => `$${formatNumber(Number(value))}`,
              },
              grid: { color: '#e5e5e5', lineWidth: 1 },
              border: {
                color: hoveredAxis === 'x' ? 'blue' : '#666',
                width: hoveredAxis === 'x' ? 4 : 1, // Border glow effect on hover
              },
            },
            y: {
              type: 'category',
              labels: labels,
              title: { display: true, text: 'Division' },
              ticks: { autoSkip: false },
              grid: { color: '#e5e5e5', lineWidth: 1 },
              border: {
                color: hoveredAxis === 'y' ? 'blue' : '#666',
                width: hoveredAxis === 'y' ? 4 : 1, // Border glow effect on hover
              },
            },
          },
          maintainAspectRatio: false,
          onHover: (event, chartElement) => {
            if (chartElement.length) {
              const hoveredElement = chartElement[0].element;

              if (hoveredElement && hoveredElement.hasOwnProperty('_xScale')) {
                setHoveredAxis('x');
              } else if (hoveredElement && hoveredElement.hasOwnProperty('_yScale')) {
                setHoveredAxis('y');
              }
            } else {
              setHoveredAxis(null);
            }
          },
        },
      });

      return () => {
        chartInstance.destroy();
      };
    }
  }, [
    sortedData,
    dotColorOne,
    dotColorTwo,
    positiveLineColor,
    negativeLineColor,
    hoveredAxis,
  ]);

  return (
    <div style={{ height: '600px', position: 'relative' }}>
      <canvas ref={chartRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default ConnectedDotPlot;
