import {
  AppliedPrompts,
  Context,
  onDrillDownFunction,
  ResponseData,
  TContext
} from '@incorta-org/component-sdk';
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import './styles.less'; // Import the styles file

// Define a type for component settings
interface ComponentSettings {
  dotColorOne?: string;
  dotColorTwo?: string;
  positiveLineColor?: string;
  negativeLineColor?: string;
  sortingStyle?: string;
  isShowingGrid?: boolean; // New setting for displaying grid
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
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSortingStyle = useRef<string>('Original');

  const settings = context?.component?.settings as ComponentSettings;
  const dotColorOne = settings?.dotColorOne || 'var(--dot-color-one)';
  const dotColorTwo = settings?.dotColorTwo || 'var(--dot-color-two)';
  const positiveLineColor = settings?.positiveLineColor || 'var(--positive-line-color)';
  const negativeLineColor = settings?.negativeLineColor || 'var(--negative-line-color)';
  const hoverLineColor = 'blue'; // Hover color for the line
  const isShowingGrid = settings?.isShowingGrid || false; // Default is false

  // Maintain the current sorting style
  const [sortingStyle, setSortingStyle] = useState<string>(settings?.sortingStyle || 'Original');

  // State to maintain the current dimensions of the container
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Define the margin object (adjust these as needed for padding)
  const margin = { top: 20, right: 30, bottom: 30, left: 50 };

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

  // Effect to update the dimensions based on container size
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    // Initial size update
    handleResize();

    // Add resize event listener
    window.addEventListener('resize', handleResize);

    return () => {
      // Cleanup event listener on component unmount
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Function to determine how many labels to skip based on available space
  const calculateLabelSkip = (axisLength: number, totalLabels: number, labelSize: number) => {
    const availableSpace = axisLength - margin.top - margin.bottom; // Available space for labels
    const labelsFit = Math.floor(availableSpace / labelSize); // How many labels can fit
    const skipFactor = Math.ceil(totalLabels / labelsFit); // Determine the skip factor
    return skipFactor;
  };

  useEffect(() => {
    // Update sorting style if settings change but do not reset on prop updates
    if (settings?.sortingStyle !== currentSortingStyle.current) {
      setSortingStyle(settings.sortingStyle || 'Original');
      currentSortingStyle.current = settings.sortingStyle || 'Original';
    }

    // Remove any previous SVG elements
    d3.select(svgRef.current).selectAll('*').remove();

    const { width, height } = dimensions;

    // Calculate dynamic margin to prevent y-axis labels from being cut off
    const maxLabelLength = Math.max(...data.data.map(d => String(d[0]?.value).length));
    const leftMargin = Math.min(40 + maxLabelLength * 8, 100); // Adjust based on label length, with a max limit

    const newMargin = { ...margin, left: leftMargin }; // Use dynamic left margin

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current!)
      .attr('width', width)
      .attr('height', height)
      .style('border', 'none') // Ensure no border
      .style('outline', 'none'); // Ensure no outline

    // Sort data based on the selected sorting style
    const sortedData = sortData(data.data, sortingStyle);

    // Remove duplicate categories for y-axis
    const uniqueCategories = Array.from(new Set(sortedData.map(d => d[0]?.value)));

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => Math.max(Number(d[1]?.value) || 0, Number(d[2]?.value) || 0)) ?? 0])
      .range([newMargin.left, width - newMargin.right]);

    // Use a linear scale for the y-axis to support zooming
    const yScale = d3.scaleLinear()
      .domain([0, uniqueCategories.length - 1])
      .range([newMargin.top, height - newMargin.bottom]);

    // Calculate how many labels to skip based on width (for X-axis) and height (for Y-axis)
    const xSkipFactor = calculateLabelSkip(width, sortedData.length, 50); // 50 is the approximate width of an X-axis label
    const ySkipFactor = calculateLabelSkip(height, uniqueCategories.length, 20); // 20 is the approximate height of a Y-axis label

    // Add a clip path to ensure lines and dots don't go beyond axes
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'clip-path')
      .append('rect')
      .attr('x', newMargin.left)
      .attr('y', newMargin.top)
      .attr('width', width - newMargin.left - newMargin.right)
      .attr('height', height - newMargin.top - newMargin.bottom);

    // Function to draw lines and dots with updated scales
    const drawElements = (xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>, xSkipFactor: number, ySkipFactor: number) => {
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

      // Draw visible lines with conditional color based on the difference between points
      linesGroup.selectAll('.line')
        .data(lineData)
        .enter()
        .append('path')
        .attr('class', 'line')
        .attr('d', d => lineGenerator(d) || '') // Ensure lineGenerator returns a string
        .attr('stroke', d => {
          // Determine the color based on the difference between the second and first points
          const difference = d[1].x - d[0].x;
          return difference >= 0 ? positiveLineColor : negativeLineColor;
        })
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

    const drawAxis = (xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>, xSkipFactor: number, ySkipFactor: number) => {
      // Add x-axis with skipping logic
      const xAxis = d3.axisBottom(xScale)
        .ticks(sortedData.length)
        .tickFormat((d: d3.NumberValue, index: number) => (index % xSkipFactor === 0 ? formatNumber(d.valueOf()) : '') as string); // Skip X-axis labels

      // Add y-axis with skipping logic
      const yAxis = d3.axisLeft(yScale)
        .tickValues(d3.range(0, uniqueCategories.length)
        .filter((_, index) => index % ySkipFactor === 0)) // Skip every nth label for Y-axis
        .tickFormat((d: d3.NumberValue) => uniqueCategories[Math.floor(d.valueOf())] || ''); // Use unique categories for labels

      const xAxisElement = svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height - newMargin.bottom})`)
        .call(xAxis as any); // Type assertion to any to bypass TypeScript error

      const yAxisElement = svg.append('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${newMargin.left},0)`)
        .call(yAxis as any); // Type assertion to any to bypass TypeScript error

      // Conditionally add grid lines if isShowingGrid is true
      if (isShowingGrid) {
        // Add x-axis grid lines
        svg.append('g')
          .attr('class', 'x-grid')
          .attr('transform', `translate(0,${height - newMargin.bottom})`)
          .call(
            d3.axisBottom(xScale)
              .tickSize(-(height - newMargin.top - newMargin.bottom))
              .tickFormat(() => '')
          )
          .selectAll('line')
          .style('stroke', '#d3d3d3') // Light gray grid lines
          .style('opacity', 0.5); // Lighter grid lines

        // Add y-axis grid lines
        svg.append('g')
          .attr('class', 'y-grid')
          .attr('transform', `translate(${newMargin.left},0)`)
          .call(
            d3.axisLeft(yScale)
              .tickSize(-(width - newMargin.left - newMargin.right))
              .tickFormat(() => '')
          )
          .selectAll('line')
          .style('stroke', '#d3d3d3') // Light gray grid lines
          .style('opacity', 0.5); // Lighter grid lines
      }
    };

    // Draw initial elements with default scales
    drawElements(xScale, yScale, xSkipFactor, ySkipFactor);
    drawAxis(xScale, yScale, xSkipFactor, ySkipFactor);

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
        drawElements(newXScale, newYScale, 1, 1); // No skipping during zoom

        // Update the axes
        svg.select('.x-axis').call(d3.axisBottom(newXScale).tickFormat((d: d3.NumberValue) => formatNumber(d.valueOf())) as any);
        svg.select('.y-axis').call(d3.axisLeft(newYScale)
          .tickValues(d3.range(0, uniqueCategories.length)) // Ensure only whole numbers are used for ticks
          .tickFormat((d: d3.NumberValue) => uniqueCategories[Math.floor(d.valueOf())] || '') as any);

        // Update grid lines if visible
        if (isShowingGrid) {
          svg.select('.x-grid').call(
            d3.axisBottom(newXScale)
              .tickSize(-(height - newMargin.top - newMargin.bottom))
              .tickFormat(() => '')
          ).selectAll('line')
            .style('stroke', '#d3d3d3') // Light gray grid lines
            .style('opacity', 0.5);

          svg.select('.y-grid').call(
            d3.axisLeft(newYScale)
              .tickSize(-(width - newMargin.left - newMargin.right))
              .tickFormat(() => '')
          ).selectAll('line')
            .style('stroke', '#d3d3d3') // Light gray grid lines
            .style('opacity', 0.5);
        }
      });

    // Apply zoom behavior to the SVG
    svg.call(zoomBehavior as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);

  }, [data.data, dotColorOne, dotColorTwo, positiveLineColor, negativeLineColor, hoverLineColor, sortingStyle, isShowingGrid, dimensions]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
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
    </div>
  );
};

export default ConnectedDotPlot;
