import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export const Graph = ({ nodes }) => {
    const ref = useRef();
    const orchestrator = { id: 'orchestrator', x: 0, y: 0, fx: 0, fy: 0 };

    useEffect(() => {
        const links = nodes.map(node => ({ source: 'orchestrator', target: node.id }));

        const svg = d3.select(ref.current).attr('viewBox', [-400, -300, 800, 600]);

        const g = svg.append('g');

        const link = g.append('g')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke', 'white');

        const node = g.append('g')
            .selectAll('circle')
            .data([orchestrator, ...nodes])
            .join('circle')
            .attr('r', d => d.id === orchestrator.id ? 100 : 60)
            .attr('fill', 'none')
            .attr('stroke', 'white');

        const labels = g.append('g')
            .selectAll('text')
            .data(nodes)
            .join('text')
            .attr('fill', 'white')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '10px'); // Adjust the font size as needed
        
        labels.selectAll('tspan')
            .data(d => [d.name, d.image, d.status, d.ip])
            .join('tspan')
            .attr('x', d => d.x)
            .attr('dy', (d, i) => i ? '1em' : 0)
            .text(d => d);
        

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        const simulation = d3.forceSimulation([orchestrator, ...nodes])
            .force('link', d3.forceLink(links).id(d => d.id).distance(200).strength(1))
            .force('charge', d3.forceManyBody().strength(-500))
            .force('collide', d3.forceCollide(100));

        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y)
                .each(function (d) {
                    const dx = d.target.x - d.source.x;
                    const dy = d.target.y - d.source.y;
                    const dr = Math.sqrt(dx * dx + dy * dy);

                    const endX = d.target.x - (dx * 60) / dr;
                    const endY = d.target.y - (dy * 60) / dr;
                    const startX = d.source.x + (dx * 100) / dr;
                    const startY = d.source.y + (dy * 100) / dr;

                    d3.select(this)
                        .attr('x1', startX)
                        .attr('y1', startY)
                        .attr('x2', endX)
                        .attr('y2', endY);
                });

            node.attr('cx', d => d.x).attr('cy', d => d.y);
            labels.attr('x', d => d.x).attr('y', d => d.y);
        });
        return () => simulation.stop();
    }, [nodes]);

    return <svg ref={ref}></svg>;
};