import {
  AppliedPrompts,
  Context,
  onDrillDownFunction,
  ResponseData,
  TContext
} from '@incorta-org/component-sdk';
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './styles.less'; // Import the styles file

// Define a type for component settings
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

// Define a type for the scatter plot data points
interface ScatterDataPoint {
  x: number;
  y: number;
}

const ConnectedDotPlot: React.FC<Props> = ({ context, prompts, data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const settings = context?.component?.settings as ComponentSettings;
  const sortingStyle = settings?.sortingStyle || 'Original';
  const dotColorOne = settings?.dotColorOne || 'var(--dot-color-one)';
  const dotColorTwo = settings?.dotColorTwo || 'var(--dot-color-two)';
  const positiveLineColor = settings?.positiveLineColor || 'var(--positive-line-color)';
  const hoverLineColor = 'blue'; // Hover color for the line

  // Utility function for custom number formatting
  const formatNumber = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toPrecision(3)}B`; // Format as "B" for billions
    } else if (absValue >= 1_000_000) {
      return `${(value / 1_000_000).toPrecision(3)}M`; // Format as "M" for millions
    } else if (absValue >= 1_000) {
      return `${(value / 1_000).toPrecision(3)}K`; // Format as "K" for thousands
    } else {
      return value.toPrecision(3); // Format normally for smaller values
    }
  };

  // Utility function for sorting data based on selected sorting style
  const sortData = (data: ResponseData['data'], sortingStyle: string) => {
    const sortedData = [...data];
    switch (sortingStyle) {
      case 'Ascending':
        return sortedData.sort((a, b) => Number(a[1]?.value) - Number(b[1]?.value));
      case 'Descending':
        return sortedData.sort((a, b) => Number(b[1]?.value) - Number(a[1]?.value));
      case 'DifferenceAscending':
        return sortedData.sort((a, b) => 
          (Number(a[2]?.value) - Number(a[1]?.value)) - (Number(b[2]?.value) - Number(b[1]?.value))
        );
      case 'DifferenceDescending':
        return sortedData.sort((a, b) => 
          (Number(b[2]?.value) - Number(b[1]?.value)) - (Number(a[2]?.value) - Number(a[1]?.value))
        );
      case 'Original':
      default:
        return data; // Return original order
    }
  };

  useEffect(() => {
    // Remove any previous SVG elements
    d3.select(svgRef.current).selectAll('*').remove();

    const width = 800;
    const height = 600; // Adjust height for more space

    // Calculate dynamic margin to prevent y-axis labels from being cut off
    const maxLabelLength = Math.max(...data.data.map(d => String(d[0]?.value).length));
    const leftMargin = Math.min(40 + maxLabelLength * 8, 100); // Adjust based on label length, with a max limit

    const margin = { top: 20, right: 30, bottom: 30, left: leftMargin };

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current!)
      .attr('width', width)
      .attr('height', height);

    // Sort data based on the selected sorting style
    const sortedData = sortData(data.data, sortingStyle);

    // Remove duplicate categories for y-axis
    const uniqueCategories = Array.from(new Set(sortedData.map(d => d[0]?.value)));

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => Math.max(Number(d[1]?.value) || 0, Number(d[2]?.value) || 0)) ?? 0])
      .range([margin.left, width - margin.right]);

    // Use a linear scale for the y-axis to support zooming
    const yScale = d3.scaleLinear()
      .domain([0, uniqueCategories.length - 1])
      .range([margin.top, height - margin.bottom]);

    // Add a clip path to ensure lines and dots don't go beyond axes
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'clip-path')
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom);

    // Function to draw lines and dots with updated scales
    const drawElements = (xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>) => {
      // Clear existing elements
      svg.selectAll('.dots-group').remove();
      svg.selectAll('.lines-group').remove();

      // Create line generator
      const lineGenerator = d3.line<ScatterDataPoint>()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .curve(d3.curveLinear); // Apply a linear curve for better visualization

      // Process data for D3
      const lineData = sortedData.map((row, index) => [
        { x: Number(row[1]?.value) || 0, y: uniqueCategories.indexOf(row[0]?.value) },
        { x: Number(row[2]?.value) || 0, y: uniqueCategories.indexOf(row[0]?.value) }
      ]);

      // Create a group for lines with the clip path applied
      const linesGroup = svg.append('g')
        .attr('class', 'lines-group')
        .attr('clip-path', 'url(#clip-path)');

      // Draw visible lines
      linesGroup.selectAll('.line')
        .data(lineData)
        .enter()
        .append('path')
        .attr('class', 'line')
        .attr('d', d => lineGenerator(d) || '') // Ensure lineGenerator returns a string
        .attr('stroke', positiveLineColor)
        .attr('stroke-width', 1)
        .attr('fill', 'none');

      // Draw invisible hover lines with increased width to capture hover events
      linesGroup.selectAll('.hover-line')
        .data(lineData)
        .enter()
        .append('path')
        .attr('class', 'hover-line')
        .attr('d', d => lineGenerator(d) || '') // Ensure lineGenerator returns a string
        .attr('stroke', 'transparent') // Invisible line
        .attr('stroke-width', 7) // Increased width for hover area
        .attr('fill', 'none')
        .on('mouseover', function (event: MouseEvent, d: any) {
          const difference = Number(d[1].x) - Number(d[0].x);

          // Calculate the midpoint of the line for accurate tooltip positioning
          const midpointX = (xScale(d[1].x) + xScale(d[0].x)) / 2;
          const midpointY = (yScale(d[1].y) + yScale(d[0].y)) / 2;

          // Retrieve tooltip element dimensions for alignment
          const tooltip = d3.select(tooltipRef.current);
          const tooltipWidth = tooltip.node()?.offsetWidth || 0;
          const tooltipHeight = tooltip.node()?.offsetHeight || 0;

          // Position tooltip such that its center aligns with the midpoint of the line
          tooltip
            .style('left', `${midpointX - tooltipWidth / 2}px`) // Center horizontally
            .style('top', `${midpointY - tooltipHeight / 2}px`) // Center vertically
            .style('display', 'inline-block')
            .html(`Difference: ${formatNumber(difference)}`);
        })
        .on('mouseout', function () {
          d3.select(tooltipRef.current).style('display', 'none');
        });

      // Create a group for circles with the clip path applied
      const dotsGroup = svg.append('g')
        .attr('class', 'dots-group')
        .attr('clip-path', 'url(#clip-path)');

      // Draw circles for the first data point (blue)
      dotsGroup.selectAll('.dot-one')
        .data(sortedData)
        .enter()
        .append('circle')
        .attr('class', 'dot-one')
        .attr('cx', (d: any) => xScale(Number(d[1]?.value) || 0))
        .attr('cy', (d: any) => yScale(uniqueCategories.indexOf(d[0]?.value)))
        .attr('r', 5)
        .attr('fill', dotColorOne)
        .on('mouseover', (event: MouseEvent, d: any) => {
          const tooltip = d3.select(tooltipRef.current);
          tooltip
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 10}px`)
            .style('display', 'inline-block')
            .html(`Value: ${formatNumber(Number(d[1]?.value) || 0)}`);
        })
        .on('mouseout', () => {
          d3.select(tooltipRef.current).style('display', 'none');
        });

      // Draw circles for the second data point (orange)
      dotsGroup.selectAll('.dot-two')
        .data(sortedData)
        .enter()
        .append('circle')
        .attr('class', 'dot-two')
        .attr('cx', (d: any) => xScale(Number(d[2]?.value) || 0))
        .attr('cy', (d: any) => yScale(uniqueCategories.indexOf(d[0]?.value)))
        .attr('r', 5)
        .attr('fill', dotColorTwo)
        .on('mouseover', (event: MouseEvent, d: any) => {
          const tooltip = d3.select(tooltipRef.current);
          tooltip
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 10}px`)
            .style('display', 'inline-block')
            .html(`Value: ${formatNumber(Number(d[2]?.value) || 0)}`);
        })
        .on('mouseout', () => {
          d3.select(tooltipRef.current).style('display', 'none');
        });
    };

    // Draw initial elements with default scales
    drawElements(xScale, yScale);

    // Add x-axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(5) // Control the number of ticks
      .tickFormat((d: d3.NumberValue) => formatNumber(d.valueOf())); // Apply custom formatting to x-axis

    // Add y-axis with fixed tick values based on unique categories
    const yAxis = d3.axisLeft(yScale)
      .tickValues(d3.range(0, uniqueCategories.length)) // Ensure only whole numbers are used for ticks
      .tickFormat((d: d3.NumberValue) => uniqueCategories[Math.floor(d.valueOf())] || ''); // Use unique categories for labels

    // Append x-axis and y-axis
    const xAxisElement = svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(xAxis);

    const yAxisElement = svg.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(yAxis);

    // Zoom and pan behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5]) // Set min and max zoom levels
      .translateExtent([[0, 0], [width, height]]) // Set translate bounds
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        const transform = event.transform;

        // Update scales based on zoom
        const newXScale = transform.rescaleX(xScale);
        const newYScale = transform.rescaleY(yScale);

        // Draw elements with new scales
        drawElements(newXScale, newYScale);

        // Update the axes
        xAxisElement.call(d3.axisBottom(newXScale).tickFormat((d: d3.NumberValue) => formatNumber(d.valueOf())));
        yAxisElement.call(d3.axisLeft(newYScale)
          .tickValues(d3.range(0, uniqueCategories.length)) // Ensure only whole numbers are used for ticks
          .tickFormat((d: d3.NumberValue) => uniqueCategories[Math.floor(d.valueOf())] || '')); // Use unique categories for labels
      });

    // Apply zoom behavior to the SVG
    svg.call(zoomBehavior as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);

  }, [data.data, dotColorOne, dotColorTwo, positiveLineColor, hoverLineColor, sortingStyle]);

  return (
    <>
      <svg ref={svgRef}></svg>
      <div ref={tooltipRef} style={{ 
        position: 'absolute', 
        background: 'rgba(0, 0, 0, 0.6)', // Black with 60% opacity
        color: 'white', // White text
        padding: '5px', 
        display: 'none', 
        borderRadius: '5px', // Rounded corners
        pointerEvents: 'none' // Prevent interference with hover events
        }}>
      </div>
    </>
  );
};

export default ConnectedDotPlot;
