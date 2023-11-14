import React, { useEffect, useRef, useMemo } from 'react';
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

    elements.filter(d => d.id === orchestrator.id)
        .select('circle')
        .attr('r', 100) 
        .attr('fill', '#1F2937')
        .attr('stroke', '#fff')
        .attr('stroke-width', 4);

    elements.filter(d => d.id !== orchestrator.id)
        .select('circle')
        .attr('r', 60)
        .attr('fill', '#273241')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

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
    const orchestrator = useMemo(() => ({ id: 'orchestrator', x: 0, y: 0, fx: 0, fy: 0 }), []);

    useEffect(() => {
        const links = nodes.map(node => ({ source: 'orchestrator', target: node.id }));
        const svg = d3.select(ref.current).attr('viewBox', [-400, -300, 800, 600]);
        const g = svg.append('g');
        const elements = createElements(g, nodes, orchestrator);
        const linkElements = createLinks(g, links);

        const onNodeClick = (d) => {
            if (d.id !== orchestrator.id) {
                const newPath = `/node/${d.name}`;
                window.location.href = newPath;
            }
        };

        elements.on('click', onNodeClick);

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom);

        const simulation = configureSimulation(nodes, links, orchestrator, () => {
            linkElements
                .attr('x1', d => calculateLineEnd(orchestrator, d.target, 100).x)
                .attr('y1', d => calculateLineEnd(orchestrator, d.target, 100).y)
                .attr('x2', d => calculateLineEnd(d.source, d.target, 60).x)
                .attr('y2', d => calculateLineEnd(d.source, d.target, 60).y);

            elements.attr('transform', d => `translate(${d.x}, ${d.y})`);
        });

        return () => simulation.stop();
    }, [nodes, orchestrator]);

    return <svg ref={ref} style={{ width: '100%', height: '100%' }}></svg>;
};