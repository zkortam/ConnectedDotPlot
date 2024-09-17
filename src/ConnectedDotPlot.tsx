import {
  AppliedPrompts,
  Context,
  onDrillDownFunction,
  ResponseData,
  TContext
} from '@incorta-org/component-sdk';
import React, { useEffect, useRef, useState } from 'react';
import { Chart, ChartEvent } from 'chart.js';
import 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register the zoom plugin
Chart.register(zoomPlugin);

// Define a type for the component settings
interface ComponentSettings {
  dotColorOne?: string;
  dotColorTwo?: string;
  lineTension?: number;
  sortingStyle?: string; // Add sortingStyle to the ComponentSettings
}

interface Props {
  context: Context<TContext>;
  prompts: AppliedPrompts;
  data: ResponseData;
  drillDown: onDrillDownFunction;
}

const ConnectedDotPlot: React.FC<Props> = ({ context, prompts, data, drillDown }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const [hoverDifference, setHoverDifference] = useState<string | null>(null); // State to store the hover difference
  const [hoverInfo, setHoverInfo] = useState<{ title: string; value: string; x: number; y: number } | null>(null); // State to store dot hover info
  const [sortedData, setSortedData] = useState(data.data); // Store sorted data

  const settings = context?.component?.settings as ComponentSettings;
  const sortingStyle = settings?.sortingStyle || 'Original'; // Get the sorting style from settings

  // Function to handle sorting
  const handleSort = (): void => {
    let sorted;
    switch (sortingStyle) {
      case 'Descending':
        sorted = [...sortedData].sort((a, b) => {
          const minA = Math.min(Number(a[1]?.value) || 0, Number(a[2]?.value) || 0);
          const minB = Math.min(Number(b[1]?.value) || 0, Number(b[2]?.value) || 0);
          return minB - minA; // Descending
        });
        break;
      case 'Ascending':
        sorted = [...sortedData].sort((a, b) => {
          const minA = Math.min(Number(a[1]?.value) || 0, Number(a[2]?.value) || 0);
          const minB = Math.min(Number(b[1]?.value) || 0, Number(b[2]?.value) || 0);
          return minA - minB; // Ascending
        });
        break;
      case 'Difference Ascending':
        sorted = [...sortedData].sort((a, b) => {
          const diffA = Math.abs((Number(a[2]?.value) || 0) - (Number(a[1]?.value) || 0));
          const diffB = Math.abs((Number(b[2]?.value) || 0) - (Number(b[1]?.value) || 0));
          return diffA - diffB; // Difference Ascending
        });
        break;
      case 'Difference Descending':
        sorted = [...sortedData].sort((a, b) => {
          const diffA = Math.abs((Number(a[2]?.value) || 0) - (Number(a[1]?.value) || 0));
          const diffB = Math.abs((Number(b[2]?.value) || 0) - (Number(b[1]?.value) || 0));
          return diffB - diffA; // Difference Descending
        });
        break;
      default:
        sorted = data.data; // Original order
    }
    setSortedData(sorted);
  };

  useEffect(() => {
    if (chartRef.current && sortedData) {
      // Extract data for the chart
      const labels = sortedData.map(row => row[0]?.value); // Y-axis labels from "break" tray

      // Extract titles from measure headers
      const measureTitles = data.measureHeaders.slice(0, 2).map(header => header.label);

      // Extract colors from settings with proper typing
      const settings = context?.component?.settings as ComponentSettings;
      const dotColorOne = settings?.dotColorOne || 'blue'; // Default to blue
      const dotColorTwo = settings?.dotColorTwo || 'orange'; // Default to orange
      const lineTension = settings?.lineTension !== undefined ? settings.lineTension : 0.1; // Default line tension

      // Create pairs of points for each group to draw horizontal lines
      const datasets = labels.map((label, index) => {
        const xValueOne = Number(sortedData[index][1]?.value) || 0; // Convert X value for the first measure to number
        const xValueTwo = Number(sortedData[index][2]?.value) || 0; // Convert X value for the second measure to number

        // Calculate the difference
        const difference = xValueTwo - xValueOne;

        return {
          label: `Line for ${label}`,
          data: [
            { x: xValueOne, y: label }, // Point for the first measure
            { x: xValueTwo, y: label }  // Point for the second measure
          ],
          backgroundColor: [dotColorOne, dotColorTwo], // Use dynamic colors from settings
          borderColor: difference > 0 ? 'green' : 'red', // Dynamic line color based on difference
          borderWidth: 1,
          pointRadius: 5,
          showLine: true, // Draw line between two points
          fill: false, // Do not fill under the line
          tension: lineTension, // Apply line tension from settings
        };
      });

      const chartInstance = new Chart(chartRef.current, {
        type: 'scatter', // Base type is scatter plot for dots
        data: {
          datasets: datasets,
        },
        options: {
          plugins: {
            legend: {
              display: false, // Hide legend if not needed
            },
            tooltip: {
              enabled: false, // Disable default tooltips
            },
            zoom: {
              pan: {
                enabled: true,
                mode: 'x', // Allow panning in the x direction
              },
              zoom: {
                wheel: {
                  enabled: true, // Enable zooming with the mouse wheel
                },
                pinch: {
                  enabled: true, // Enable pinch zooming
                },
                mode: 'x', // Only zoom on the x-axis
              },
            },
          },
          interaction: {
            mode: 'nearest', // Ensures the nearest element is picked for zoom and pan
            intersect: false,
          },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: {
                display: true,
                text: 'Cumulative Revenue ($)',
              },
              ticks: {
                callback: function (value) {
                  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value as number); // Format axis ticks
                }
              }
            },
            y: {
              type: 'category',
              labels: labels,
              title: {
                display: true,
                text: 'Division',
              },
            },
          },
          maintainAspectRatio: false, // Allow chart height to be controlled by CSS
          onHover: (event, chartElement) => {
            if (chartElement.length) {
              const element = chartElement[0];
              const meta = chartInstance.getDatasetMeta(element.datasetIndex); // Correctly define 'meta' variable here
              
              if (element.datasetIndex !== undefined && element.index !== undefined) {
                const dataset = chartInstance.data.datasets[element.datasetIndex];
                const pointData = dataset.data as unknown as { x: number; y: string }[]; // Convert to unknown first, then cast

                // Check if hovering over a dot
                if (element.element && element.element.hasOwnProperty('x') && element.element.hasOwnProperty('y')) {
                  const point = pointData[element.index];
                  const measureTitle = measureTitles[element.index];
                  const formattedValue = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(point.x); // Format value

                  // Get the position of the hovered dot
                  const { x, y } = meta.data[element.index].getProps(['x', 'y'], true);

                  setHoverInfo({ title: measureTitle, value: formattedValue, x, y }); // Set the hover info for the dot
                  setHoverDifference(null); // Clear the difference when hovering over a dot
                } else if (pointData.length === 2) {
                  // Hovering over a line
                  const difference = (pointData[1].x - pointData[0].x).toFixed(2); // Calculate the difference
                  setHoverDifference(`Difference: ${difference}`); // Set the difference when hovering over the line

                  // Get the position of the hovered line element
                  const { x: x1, y: y1 } = meta.data[0].getProps(['x', 'y'], true);
                  const { x: x2, y: y2 } = meta.data[1].getProps(['x', 'y'], true);

                  // Calculate the midpoint of the line
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;

                  // Set the hover position 10px above the line's midpoint
                  setHoverInfo({ title: `Difference: ${difference}`, value: '', x: midX, y: midY - 10 });
                }
              }
            } else {
              setHoverDifference(null); // Clear the difference when not hovering over the line
              setHoverInfo(null); // Clear hover info for dots
            }
          }
        },
      });

      // Cleanup on unmount
      return () => {
        chartInstance.destroy();
      };
    }
  }, [sortedData]); // Watch sortedData for changes

  return (
    <div style={{ height: '600px', position: 'relative' }}> {/* Set a container height */}
      <canvas ref={chartRef} style={{ height: '100%', width: '100%' }} /> {/* Make canvas fill the container */}
      
      {hoverInfo && hoverInfo.value !== '' && (
        <div style={{
          position: 'absolute',
          left: `${hoverInfo.x}px`,
          top: `${hoverInfo.y - 20}px`,
          padding: '5px 10px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          borderRadius: '4px',
          transform: 'translate(-50%, -100%)', // Center horizontally and position above
        }}>
          {hoverInfo.title}: {hoverInfo.value}
        </div>
      )}

      {hoverInfo && hoverInfo.value === '' && (
        <div style={{
          position: 'absolute',
          left: `${hoverInfo.x}px`,
          top: `${hoverInfo.y}px`,
          padding: '5px 10px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          borderRadius: '4px',
          transform: 'translate(-50%, -100%)', // Center horizontally and position above
        }}>
          {hoverInfo.title}
        </div>
      )}
    </div>
  );
};

export default ConnectedDotPlot;
