import {
  AppliedPrompts,
  Context,
  onDrillDownFunction,
  ResponseData,
  TContext
} from '@incorta-org/component-sdk';
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import './styles.less';

interface ComponentSettings {
  dotColorOne?: string;
  dotColorTwo?: string;
  positiveLineColor?: string;
  negativeLineColor?: string;
  sortingStyle?: string;
  isShowingGrid?: boolean;
}

interface Props {
  context: Context<TContext>;
  prompts: AppliedPrompts;
  data: ResponseData;
  drillDown: onDrillDownFunction;
}

interface ScatterDataPoint {
  x: number;
  y: number;
}

const ConnectedDotPlot: React.FC<Props> = ({ context, prompts, data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const settings = context?.component?.settings as ComponentSettings;
  const dotColorOne = settings?.dotColorOne || 'var(--dot-color-one)';
  const dotColorTwo = settings?.dotColorTwo || 'var(--dot-color-two)';
  const positiveLineColor = settings?.positiveLineColor || 'var(--positive-line-color)';
  const negativeLineColor = settings?.negativeLineColor || 'var(--negative-line-color)';
  const isShowingGrid = settings?.isShowingGrid || false;

  const [sortingStyle, setSortingStyle] = useState<string>(settings?.sortingStyle || 'Original');
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const margin = { top: 20, right: 30, bottom: 30, left: 50 };
  const measureLabels = data.measureHeaders.map(header => header.label.split('.').pop() || 'Value');

  const formatNumber = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toPrecision(3)}B`;
    } else if (absValue >= 1_000_000) {
      return `${(value / 1_000_000).toPrecision(3)}M`;
    } else if (absValue >= 1_000) {
      return `${(value / 1_000).toPrecision(3)}K`;
    } else {
      return value.toPrecision(3);
    }
  };

  const sortData = (data: ResponseData['data'], sortingStyle: string) => {
    const sortedData = [...data];
    switch (sortingStyle) {
      case 'Ascending':
        return sortedData.sort((a, b) => (Number(a[1]?.value) || 0) - (Number(b[1]?.value) || 0));
      case 'Descending':
        return sortedData.sort((a, b) => (Number(b[1]?.value) || 0) - (Number(a[1]?.value) || 0));
      case 'DifferenceAscending':
        return sortedData.sort((a, b) => 
          ((Number(a[2]?.value) || 0) - (Number(a[1]?.value) || 0)) - ((Number(b[2]?.value) || 0) - (Number(b[1]?.value) || 0))
        );
      case 'DifferenceDescending':
        return sortedData.sort((a, b) => 
          ((Number(b[2]?.value) || 0) - (Number(b[1]?.value) || 0)) - ((Number(a[2]?.value) || 0) - (Number(a[1]?.value) || 0))
        );
      case 'Original':
      default:
        return data;
    }
  };

  useEffect(() => {
    if (settings?.sortingStyle !== sortingStyle) {
      setSortingStyle(settings.sortingStyle || 'Original');
    }
  }, [settings?.sortingStyle, sortingStyle]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const calculateLabelSkip = (axisLength: number, totalLabels: number, labelSize: number) => {
    const availableSpace = axisLength - margin.top - margin.bottom;
    const labelsFit = Math.floor(availableSpace / labelSize);
    return Math.ceil(totalLabels / labelsFit);
  };

  useEffect(() => {
    d3.select(svgRef.current).selectAll('*').remove();
    const { width, height } = dimensions;
    const maxLabelLength = Math.max(...data.data.map(d => String(d[0]?.value).length));
    const leftMargin = Math.min(40 + maxLabelLength * 8, 100);
    const newMargin = { ...margin, left: leftMargin };

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current!)
      .attr('width', width)
      .attr('height', height)
      .style('border', 'none')
      .style('outline', 'none');

    const sortedData = sortData(data.data, sortingStyle);
    const uniqueCategories = Array.from(new Set(sortedData.map(d => d[0]?.value)));

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => Math.max(Number(d[1]?.value) || 0, Number(d[2]?.value) || 0)) ?? 0])
      .range([newMargin.left, width - newMargin.right]);

      const yScale = d3.scaleLinear()
      .domain([0, uniqueCategories.length - 1]) // Keep the domain unchanged
      .range([newMargin.top, height - newMargin.bottom - 10]); // Add 10px margin
    
    
    const xSkipFactor = calculateLabelSkip(width, sortedData.length, 50);
    const ySkipFactor = calculateLabelSkip(height, uniqueCategories.length, 20);

    const xAxisElement = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height - newMargin.bottom})`); // X-axis at bottom margin
  
  const yAxisElement = svg.append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${newMargin.left},0)`); // Y-axis at left margin
  

    svg.append('defs')
      .append('clipPath')
      .attr('id', 'clip-path')
      .append('rect')
      .attr('x', newMargin.left)
      .attr('y', newMargin.top)
      .attr('width', width - newMargin.left - newMargin.right)
      .attr('height', height - newMargin.top - newMargin.bottom);

    const drawElements = (xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>) => {
      svg.selectAll('.dots-group').remove();
      svg.selectAll('.lines-group').remove();

      const lineGenerator = d3.line<ScatterDataPoint>()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .curve(d3.curveLinear);

      const linesGroup = svg.append('g')
        .attr('class', 'lines-group')
        .attr('clip-path', 'url(#clip-path)');

      const dotsGroup = svg.append('g')
        .attr('class', 'dots-group')
        .attr('clip-path', 'url(#clip-path)');

        sortedData.forEach((row, index) => {
          const categoryLabel = row[0]?.value;
          const valueOne = Number(row[1]?.value) || 0;
          const valueTwo = Number(row[2]?.value) || 0;
  
          // Calculate Y position based on category index
          const yPosition = yScale(uniqueCategories.indexOf(categoryLabel));

          // Skip rendering if Y position falls within the 10px margin above the X-axis
          if (yPosition >= height - newMargin.bottom - 10) return;

          // Line between the two values
          linesGroup.append('path')
            .datum([
              { x: valueOne, y: uniqueCategories.indexOf(categoryLabel) },
              { x: valueTwo, y: uniqueCategories.indexOf(categoryLabel) }
            ])
            .attr('class', 'line')
            .attr('d', lineGenerator)
            .attr('stroke', valueTwo - valueOne >= 0 ? positiveLineColor : negativeLineColor)
            .attr('stroke-width', 1)
            .attr('fill', 'none');
  
          // First dot (dot for measure one)
          dotsGroup.append('circle')
            .attr('class', 'dot-one')
            .attr('cx', xScale(valueOne))
            .attr('cy', yPosition)
            .attr('r', 5)
            .attr('fill', dotColorOne)
            .on('mouseover', (event) => {
              const tooltip = d3.select(tooltipRef.current);
              tooltip
                .style('left', `${event.pageX + 10}px`)
                .style('top', `${event.pageY - 10}px`)
                .style('display', 'inline-block')
                .html(`${categoryLabel}<br>${measureLabels[0]}: ${formatNumber(valueOne)}`);
            })
            .on('mouseout', () => {
              d3.select(tooltipRef.current).style('display', 'none');
            });
  
          // Second dot (dot for measure two)
          dotsGroup.append('circle')
            .attr('class', 'dot-two')
            .attr('cx', xScale(valueTwo))
            .attr('cy', yPosition)
            .attr('r', 5)
            .attr('fill', dotColorTwo)
            .on('mouseover', (event) => {
              const tooltip = d3.select(tooltipRef.current);
              tooltip
                .style('left', `${event.pageX + 10}px`)
                .style('top', `${event.pageY - 10}px`)
                .style('display', 'inline-block')
                .html(`${categoryLabel}<br>${measureLabels[1]}: ${formatNumber(valueTwo)}`);
            })
            .on('mouseout', () => {
              d3.select(tooltipRef.current).style('display', 'none');
            });
        });
      };

  
      const drawAxis = (xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>, zoomFactor: number) => {
        const adjustedYSKipFactor = Math.max(1, Math.floor(ySkipFactor / zoomFactor));
        const adjustedXSKipFactor = Math.max(1, Math.floor(xSkipFactor / zoomFactor));
  
        const xAxis = d3.axisBottom(xScale)
          .ticks(Math.max(2, width / (50 * zoomFactor)))  // Adjust ticks dynamically
          .tickFormat((d, index) => 
            index % adjustedXSKipFactor === 0 ? formatNumber(d.valueOf()) : ''
          );
  
        const yAxis = d3.axisLeft(yScale)
          .tickValues(d3.range(0, uniqueCategories.length).filter((_, index) => {
            const yPosition = yScale(index);
            return yPosition >= newMargin.top && yPosition < height - newMargin.bottom;
          }))
          .tickFormat((d: d3.NumberValue) => uniqueCategories[Math.floor(d.valueOf())] || '');
  
        xAxisElement.call(xAxis);
        yAxisElement.call(yAxis);
  
        if (isShowingGrid) {
          svg.selectAll('.x-grid').remove();
          svg.selectAll('.y-grid').remove();
  
          svg.append('g')
            .attr('class', 'x-grid')
            .attr('transform', `translate(0,${height - newMargin.bottom})`)
            .call(d3.axisBottom(xScale).tickSize(-(height - newMargin.top - newMargin.bottom)).tickFormat(() => ''))
            .selectAll('line').style('stroke', '#d3d3d3').style('opacity', 0.5);
  
          svg.append('g')
            .attr('class', 'y-grid')
            .attr('transform', `translate(${newMargin.left},0)`)
            .call(d3.axisLeft(yScale).tickSize(-(width - newMargin.left - newMargin.right)).tickFormat(() => ''))
            .selectAll('line').style('stroke', '#d3d3d3').style('opacity', 0.5);
        }
      };
  
      drawElements(xScale, yScale);
      drawAxis(xScale, yScale, 1);
  
      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.5, 5])
  .translateExtent([[0, 0], [width, height]])
  .on('zoom', (event) => {
    const transform = event.transform;
    const newXScale = transform.rescaleX(xScale);
    const newYScale = transform.rescaleY(
      yScale.copy().range([newMargin.top, height - newMargin.bottom - 10]) // Respect 10px margin
    );

    drawElements(newXScale, newYScale);
    drawAxis(newXScale, newYScale, transform.k);
  });

svg.call(zoomBehavior);

  
    }, [data.data, dotColorOne, dotColorTwo, positiveLineColor, negativeLineColor, sortingStyle, isShowingGrid, dimensions]);
  
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <svg ref={svgRef}></svg>
        <div ref={tooltipRef} style={{ 
          position: 'absolute', 
          background: 'rgba(0, 0, 0, 0.6)', 
          color: 'white', 
          padding: '5px', 
          display: 'none', 
          borderRadius: '5px', 
          pointerEvents: 'none'
        }}>
        </div>
      </div>
    );
  };
  
  export default ConnectedDotPlot;
  
