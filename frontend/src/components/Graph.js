import React, { useEffect, useRef, useMemo, useState } from 'react';
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

const createGradients = (svg) => {
    const defs = svg.append('defs');
    
    // Gradiente para el orquestador
    const orchestratorGradient = defs.append('radialGradient')
        .attr('id', 'orchestratorGradient')
        .attr('cx', '30%')
        .attr('cy', '30%');
    
    orchestratorGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#ffffff')
        .attr('stop-opacity', 0.1);
    
    orchestratorGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#000000')
        .attr('stop-opacity', 0.8);
    
    // Gradiente para nodos
    const nodeGradient = defs.append('radialGradient')
        .attr('id', 'nodeGradient')
        .attr('cx', '30%')
        .attr('cy', '30%');
    
    nodeGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#ffffff')
        .attr('stop-opacity', 0.05);
    
    nodeGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#1d1d1f')
        .attr('stop-opacity', 1);
    
    // Filtros para efectos
    const filter = defs.append('filter')
        .attr('id', 'glow')
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');
    
    filter.append('feGaussianBlur')
        .attr('stdDeviation', '3')
        .attr('result', 'coloredBlur');
    
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
};

const createElements = (g, nodes, orchestrator, orchestratorIP) => {
    const elements = g.selectAll('.element')
        .data([orchestrator, ...nodes], d => d.id)
        .join(
            enter => {
                const elementsEnter = enter.append('g')
                    .attr('class', 'element')
                    .style('opacity', 0)
                    .style('cursor', 'pointer');
                
                // Círculo principal con gradiente
                elementsEnter.append('circle')
                    .attr('class', 'main-circle')
                    .attr('r', d => d.id === orchestrator.id ? 80 : 50)
                    .attr('fill', d => d.id === orchestrator.id ? 'url(#orchestratorGradient)' : 'url(#nodeGradient)')
                    .attr('stroke', d => d.id === orchestrator.id ? '#007AFF' : '#48484a')
                    .attr('stroke-width', d => d.id === orchestrator.id ? 2 : 1)
                    .style('filter', 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))')
                    .style('transition', 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)');
                
                // Círculo interior para efecto de profundidad
                elementsEnter.filter(d => d.id === orchestrator.id)
                    .append('circle')
                    .attr('class', 'inner-circle')
                    .attr('r', 60)
                    .attr('fill', 'none')
                    .attr('stroke', '#007AFF')
                    .attr('stroke-width', 1)
                    .attr('opacity', 0.3);
                
                // Texto del orquestador
                elementsEnter.filter(d => d.id === orchestrator.id)
                    .append('text')
                    .attr('class', 'orchestrator-title')
                    .attr('fill', '#f2f2f7')
                    .attr('text-anchor', 'middle')
                    .attr('font-family', '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif')
                    .attr('font-size', '16px')
                    .attr('font-weight', '600')
                    .attr('dy', '-8px')
                    .text('Orchestrator');
                
                elementsEnter.filter(d => d.id === orchestrator.id)
                    .append('text')
                    .attr('class', 'orchestrator-ip')
                    .attr('fill', '#8e8e93')
                    .attr('text-anchor', 'middle')
                    .attr('font-family', '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif')
                    .attr('font-size', '11px')
                    .attr('font-weight', '400')
                    .attr('dy', '8px')
                    .text(orchestratorIP);
                
                // Información de nodos
                const nodeInfo = elementsEnter.filter(d => d.id !== orchestrator.id);
                
                nodeInfo.append('text')
                    .attr('class', 'node-name')
                    .attr('fill', '#f2f2f7')
                    .attr('text-anchor', 'middle')
                    .attr('font-family', '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif')
                    .attr('font-size', '12px')
                    .attr('font-weight', '500')
                    .attr('dy', '-12px')
                    .text(d => d.name?.slice(0, 12) + (d.name?.length > 12 ? '...' : ''));
                
                nodeInfo.append('text')
                    .attr('class', 'node-status')
                    .attr('fill', d => d.status === 'active' ? '#34c759' : '#ff9500')
                    .attr('text-anchor', 'middle')
                    .attr('font-family', '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif')
                    .attr('font-size', '10px')
                    .attr('font-weight', '500')
                    .attr('dy', '2px')
                    .text(d => d.status);
                
                nodeInfo.append('text')
                    .attr('class', 'node-ip')
                    .attr('fill', '#8e8e93')
                    .attr('text-anchor', 'middle')
                    .attr('font-family', '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif')
                    .attr('font-size', '9px')
                    .attr('font-weight', '400')
                    .attr('dy', '14px')
                    .text(d => d.ip);
                
                // Eventos de interacción
                elementsEnter
                    .on('mouseenter', function(event, d) {
                        const element = d3.select(this);
                        element.select('.main-circle')
                            .transition()
                            .duration(200)
                            .ease(d3.easeCubicOut)
                            .attr('r', d => d.id === orchestrator.id ? 85 : 55)
                            .style('filter', 'drop-shadow(0 8px 24px rgba(0, 122, 255, 0.3))');
                        
                        element.selectAll('text')
                            .transition()
                            .duration(200)
                            .ease(d3.easeCubicOut)
                            .style('opacity', 1);
                    })
                    .on('mouseleave', function(event, d) {
                        const element = d3.select(this);
                        element.select('.main-circle')
                            .transition()
                            .duration(200)
                            .ease(d3.easeCubicOut)
                            .attr('r', d => d.id === orchestrator.id ? 80 : 50)
                            .style('filter', 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))');
                    })
                    .on('click', function(event, d) {
                        // Efecto de clic
                        const element = d3.select(this);
                        element.select('.main-circle')
                            .transition()
                            .duration(100)
                            .ease(d3.easeCubicOut)
                            .attr('r', d => d.id === orchestrator.id ? 75 : 45)
                            .transition()
                            .duration(100)
                            .attr('r', d => d.id === orchestrator.id ? 80 : 50);
                        
                        // Navegación
                        if (d.id === orchestrator.id) {
                            const url = window.location.href.split('/node')[0];
                            window.location.href = url;
                        } else {
                            const baseUrl = window.location.href.split('/node')[0];
                            window.location.href = `${baseUrl}/node/${d.id}`;
                        }
                    });
                
                return elementsEnter.transition()
                    .duration(800)
                    .ease(d3.easeCubicOut)
                    .style('opacity', 1);
            },
            update => update,
            exit => exit.transition()
                .duration(400)
                .ease(d3.easeCubicIn)
                .style('opacity', 0)
                .remove()
        );
    
    return elements;
};

const createLinks = (g, links) => {
    return g.selectAll('.link')
        .data(links, d => `${d.source.id}-${d.target.id}`)
        .join(
            enter => enter.append('line')
                .attr('class', 'link')
                .attr('stroke', '#48484a')
                .attr('stroke-width', 1)
                .attr('opacity', 0.6)
                .style('stroke-dasharray', '2,2')
                .style('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))')
                .style('opacity', 0)
                .transition()
                .duration(600)
                .delay((d, i) => i * 100)
                .ease(d3.easeCubicOut)
                .style('opacity', 0.6),
            update => update,
            exit => exit.transition()
                .duration(300)
                .style('opacity', 0)
                .remove()
        );
};

const configureSimulation = (nodes, links, orchestrator, onTick) => {
    return d3.forceSimulation([orchestrator, ...nodes])
        .force('link', d3.forceLink(links).id(d => d.id).distance(180).strength(0.8))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('collide', d3.forceCollide(100))
        .force('center', d3.forceCenter(0, 0))
        .alphaDecay(0.02)
        .on('tick', onTick);
};

export const Graph = ({ nodes = [], orchestratorIP = 'Unknown' }) => {
    const ref = useRef();
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    
    const orchestrator = useMemo(() => ({ 
        id: 'orchestrator', 
        x: 0, 
        y: 0, 
        fx: 0, 
        fy: 0 
    }), []);

    // Responsive handling
    useEffect(() => {
        const handleResize = () => {
            if (ref.current?.parentElement) {
                const { width, height } = ref.current.parentElement.getBoundingClientRect();
                setDimensions({ width, height });
            }
        };
        
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!nodes.length) return;
        
        const links = nodes.map(node => ({ 
            source: orchestrator.id, 
            target: node.id 
        }));
        
        const svg = d3.select(ref.current)
            .attr('viewBox', [-dimensions.width/2, -dimensions.height/2, dimensions.width, dimensions.height])
            .style('background', 'radial-gradient(circle at center, #1c1c1e 0%, #000000 100%)');
        
        // Limpiar contenido previo
        svg.selectAll('*').remove();
        
        // Crear gradientes y filtros
        createGradients(svg);
        
        const g = svg.append('g');
        
        const linkElements = createLinks(g, links);
        const elements = createElements(g, nodes, orchestrator, orchestratorIP);

        // Configurar zoom con límites suaves
        const zoom = d3.zoom()
            .scaleExtent([0.3, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        
        svg.call(zoom)
            .on('dblclick.zoom', null); // Deshabilitar zoom en doble clic

        const simulation = configureSimulation(nodes, links, orchestrator, () => {
            linkElements
                .attr('x1', d => calculateLineEnd(d.source, d.target, 80).x)
                .attr('y1', d => calculateLineEnd(d.source, d.target, 80).y)
                .attr('x2', d => calculateLineEnd(d.target, d.source, 50).x)
                .attr('y2', d => calculateLineEnd(d.target, d.source, 50).y);

            elements.attr('transform', d => `translate(${d.x}, ${d.y})`);
        });

        return () => {
            simulation.stop();
            svg.selectAll('*').remove();
        };
    }, [nodes, orchestrator, orchestratorIP, dimensions]);

    return (
        <div className="relative w-full h-full bg-black overflow-hidden rounded-2xl">
            <svg 
                ref={ref} 
                className="w-full h-full"
                style={{ 
                    background: 'radial-gradient(circle at 30% 30%, #1c1c1e 0%, #000000 100%)',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif'
                }}
            />
            
            {/* Overlay controls (estilo Apple) */}
            <div className="absolute top-4 right-4 bg-black bg-opacity-20 backdrop-blur-md rounded-xl p-2 border border-white border-opacity-10">
                <div className="flex space-x-2">
                    <button className="w-8 h-8 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg transition-all duration-200 flex items-center justify-center">
                        <span className="text-white text-xs">+</span>
                    </button>
                    <button className="w-8 h-8 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg transition-all duration-200 flex items-center justify-center">
                        <span className="text-white text-xs">-</span>
                    </button>
                </div>
            </div>
            
            {/* Info panel */}
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-20 backdrop-blur-md rounded-xl p-4 border border-white border-opacity-10 max-w-xs">
                <h3 className="text-white font-medium text-sm mb-2">Network Overview</h3>
                <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-gray-300">
                        <span>Nodes:</span>
                        <span className="text-white font-medium">{nodes.length}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                        <span>Status:</span>
                        <span className="text-green-400 font-medium">Active</span>
                    </div>
                </div>
            </div>
        </div>
    );
};