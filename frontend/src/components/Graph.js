import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const calculateLineEnd = (source, target, targetRadius) => {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dr = Math.sqrt(dx * dx + dy * dy);
    return {
        x: target.x - (dx * targetRadius) / dr,
        y: target.y - (dy * targetRadius) / dr
    };
};

const createElements = (g, nodes, orchestrator) => {
    const elements = g.selectAll('.element')
        .data([orchestrator, ...nodes])
        .enter()
        .append('g')
        .attr('class', 'element');

    elements.append('circle')
        .attr('r', d => d.id === orchestrator.id ? 100 : 60)
        .attr('fill', 'none')
        .attr('stroke', 'white');

    elements.append('text')
        .attr('fill', 'white')
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .selectAll('tspan')
        .data(d => d.id !== orchestrator.id ? [d.name, d.image, d.status, d.ip] : [])
        .enter()
        .append('tspan')
        .attr('x', 0)
        .attr('dy', (d, i) => `${i * 10 - 1}px`)
        .text(d => d);

    return elements;
};

const createLinks = (g, links) => {
    return g.selectAll('.link')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', 'white');
};

const configureSimulation = (nodes, links, orchestrator, onTick) => {
    return d3.forceSimulation([orchestrator, ...nodes])
        .force('link', d3.forceLink(links).id(d => d.id).distance(200).strength(1))
        .force('charge', d3.forceManyBody().strength(-500))
        .force('collide', d3.forceCollide(100))
        .on('tick', onTick);
};

export const Graph = ({ nodes }) => {
    const ref = useRef();
    const orchestrator = { id: 'orchestrator', x: 0, y: 0, fx: 0, fy: 0 };

    useEffect(() => {
        const links = nodes.map(node => ({ source: 'orchestrator', target: node.id }));
        const svg = d3.select(ref.current).attr('viewBox', [-400, -300, 800, 600]);
        const g = svg.append('g');
        const elements = createElements(g, nodes, orchestrator);
        const linkElements = createLinks(g, links);

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom);

        const simulation = configureSimulation(nodes, links, orchestrator, () => {
            linkElements
                .attr('x1', d => calculateLineEnd(orchestrator, d.target, 100).x) // Orquestador como origen
                .attr('y1', d => calculateLineEnd(orchestrator, d.target, 100).y)
                .attr('x2', d => calculateLineEnd(d.source, d.target, 60).x) // Nodo como destino
                .attr('y2', d => calculateLineEnd(d.source, d.target, 60).y);

            elements.attr('transform', d => `translate(${d.x}, ${d.y})`);
        });

        return () => simulation.stop();
    }, [nodes]);

    const calculatePosition = (d, axis) => {
        const offsetTarget = d.target.id === orchestrator.id ? 100 : 60;
        const delta = d.target[axis] - d.source[axis];
        const distance = Math.sqrt(delta * delta);
        const scale = (distance - offsetTarget) / distance;
        return d.source[axis] + delta * scale;
    };

    return <svg ref={ref}></svg>;
};