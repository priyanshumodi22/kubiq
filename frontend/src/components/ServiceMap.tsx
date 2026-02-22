import { useMemo, useState, useEffect } from 'react';
import dagre from 'dagre';
import {
    ReactFlow,
    Controls,
    Background,
    Node,
    Edge,
    Position,
    MarkerType,
    Handle
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IServiceDependency } from '../hooks/useServiceMap';
import { Server } from 'lucide-react';

interface ServiceMapProps {
    dependencies: IServiceDependency[];
    onNodeClick?: (serviceName: string) => void;
    onEdgeClick?: (source: string, target: string) => void;
    onPaneClick?: () => void;
}

// A custom node component to make the services look like beautiful cards
const CustomServiceNode = ({ data }: { data: { label: string, isError?: boolean, isPulsing?: boolean } }) => {
    const isError = data.isError;
    const isPulsing = data.isPulsing;

    const borderGlow = isError ? 'border-red-500 shadow-red-900/30' : 'border-gray-700';
    const bgGradient = isError ? 'from-red-500/20' : 'from-primary/10';
    const iconBg = isError ? 'bg-red-500/20 text-red-500' : 'bg-primary/20 text-primary';

    // Animate a soft ringing glow when new data arrives
    const pulseEffect = isPulsing ? `ring-2 ring-offset-2 ring-offset-bg-surface ${isError ? 'ring-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'ring-primary/50 shadow-[0_0_20px_rgba(59,130,246,0.4)]'} transition-all duration-300 scale-[1.02]` : 'transition-all duration-700';

    return (
        <div className={`px-5 py-3 shadow-2xl rounded-xl bg-bg-surface/80 backdrop-blur-md border ${borderGlow} ${pulseEffect} min-w-[150px] flex items-center justify-center gap-3 hover:scale-105 group relative overflow-hidden`}>
            <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-gray-500 !border-0 opacity-0" />

            <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            <div className={`p-2 rounded-lg ${iconBg}`}>
                <Server className="w-5 h-5" />
            </div>
            <div className="font-bold text-white text-sm whitespace-nowrap z-10">
                {data.label}
            </div>

            <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-gray-500 !border-0 opacity-0" />
        </div>
    );
};

const nodeTypes = {
    serviceNode: CustomServiceNode,
};

export default function ServiceMap({ dependencies, onNodeClick, onEdgeClick, onPaneClick }: ServiceMapProps) {
    const [isPulsing, setIsPulsing] = useState(false);

    // Trigger visual pulse when data updates
    useEffect(() => {
        if (dependencies.length > 0) {
            setIsPulsing(true);
            const timer = setTimeout(() => setIsPulsing(false), 2000); // 2 second pulse
            return () => clearTimeout(timer);
        }
    }, [dependencies]);

    // Process our flat database dependencies into React Flow nodes and edges
    const { nodes, edges } = useMemo(() => {
        const uniqueNodes = new Set<string>();
        dependencies.forEach(dep => {
            uniqueNodes.add(dep.source);
            uniqueNodes.add(dep.target);
        });

        // Map nodes that have incoming errors
        const nodeHasError = new Map<string, boolean>();
        dependencies.forEach(dep => {
            const errorRate = dep.errorCount / dep.callCount;
            if (errorRate > 0.05) { // If edge error rate > 5%, mark target service as unhealthy
                nodeHasError.set(dep.target, true);
            }
        });

        const generatedNodes: Node[] = Array.from(uniqueNodes).map((serviceName) => ({
            id: serviceName,
            type: 'serviceNode',
            position: { x: 0, y: 0 },
            data: {
                label: serviceName,
                isError: nodeHasError.get(serviceName) || false,
                isPulsing
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
        }));

        const generatedEdges: Edge[] = dependencies.map((dep, i) => {
            const errorRate = dep.errorCount / dep.callCount;
            const isError = errorRate > 0.05;
            const edgeColor = isError ? '#ef4444' : '#3b82f6'; // red-500 vs blue-500

            return {
                id: `edge-${dep.source}-${dep.target}-${i}`,
                source: dep.source,
                target: dep.target,
                type: 'default',
                label: `${dep.callCount} reqs${isError ? ` (${Math.round(errorRate * 100)}% err)` : ''}`,
                labelStyle: { fill: isError ? '#ef4444' : '#9ca3af', fontWeight: 600, fontSize: 12 },
                labelBgStyle: { fill: '#1f2937', color: '#fff', fillOpacity: 0.8 },
                labelBgPadding: [6, 4],
                labelBgBorderRadius: 4,
                animated: true,
                style: {
                    strokeWidth: Math.min(Math.max(dep.callCount / 10, 2), 6),
                    stroke: edgeColor,
                    strokeDasharray: isError ? '5,5' : 'none' // Dashed line for errors
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 12,
                    height: 12,
                    color: edgeColor,
                }
            };
        });

        if (generatedNodes.length === 0) {
            generatedNodes.push({
                id: 'empty',
                type: 'serviceNode',
                position: { x: 300, y: 200 },
                data: { label: 'Waiting for telemetry traffic...' }
            });
            return { nodes: generatedNodes, edges: generatedEdges };
        }

        // Use Dagre to auto-layout the nodes Left-to-Right
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        // Increase ranksep and nodesep to give plenty of room for the Domain Boundary Boxes
        dagreGraph.setGraph({ rankdir: 'LR', ranksep: 250, nodesep: 250 });

        generatedNodes.forEach((node) => {
            // Tell Dagre that the nodes are technically much larger than they appear
            // to account for the massive 60px padding on the Domain Cluster boxes
            dagreGraph.setNode(node.id, { width: 350, height: 250 });
        });

        generatedEdges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const prefixMap = new Map<string, string>();
        uniqueNodes.forEach(serviceName => {
            const parts = serviceName.split('-');
            const prefix = parts.length > 0 ? parts[0] : 'core';
            prefixMap.set(serviceName, prefix);
        });

        const nodePositions = new Map<string, { x: number, y: number }>();
        const newNodes = generatedNodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const x = nodeWithPosition.x - 100;
            const y = nodeWithPosition.y - 30;
            nodePositions.set(node.id, { x, y });
            return {
                ...node,
                position: { x, y },
                zIndex: 10
            };
        });

        // Generate Domain Clusters
        const groupBounds = new Map<string, { minX: number, maxX: number, minY: number, maxY: number }>();
        nodePositions.forEach((pos, id) => {
            const prefix = prefixMap.get(id) || 'core';
            if (!groupBounds.has(prefix)) {
                groupBounds.set(prefix, { minX: pos.x, maxX: pos.x + 200, minY: pos.y, maxY: pos.y + 60 });
            } else {
                const b = groupBounds.get(prefix)!;
                b.minX = Math.min(b.minX, pos.x);
                b.maxX = Math.max(b.maxX, pos.x + 200);
                b.minY = Math.min(b.minY, pos.y);
                b.maxY = Math.max(b.maxY, pos.y + 60);
            }
        });

        const padding = 60;
        const groupNodes: Node[] = [];
        groupBounds.forEach((b, prefix) => {
            groupNodes.push({
                id: `group-${prefix}`,
                type: 'default',
                position: { x: b.minX - padding, y: b.minY - padding - 40 },
                data: { label: `${prefix.toUpperCase()} DOMAIN` },
                style: {
                    width: (b.maxX - b.minX) + (padding * 2),
                    height: (b.maxY - b.minY) + (padding * 2) + 40,
                    backgroundColor: 'rgba(55, 65, 81, 0.3)',
                    border: '2px dashed rgba(156, 163, 175, 0.2)',
                    borderRadius: '24px',
                    color: '#9ca3af',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: '16px',
                    zIndex: -1,
                    pointerEvents: 'none'
                },
                zIndex: -1,
                selectable: false,
                draggable: false
            });
        });

        return { nodes: [...groupNodes, ...newNodes], edges: generatedEdges };
    }, [dependencies, isPulsing]);

    return (
        <div className="w-full h-[600px] bg-bg-card/30 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                className="bg-black/20"
                minZoom={0.2}
                colorMode="dark"
                onNodeClick={(_, node) => onNodeClick && onNodeClick(node.id)}
                onEdgeClick={(_, edge) => onEdgeClick && onEdgeClick(edge.source, edge.target)}
                onPaneClick={onPaneClick}
            >
                <Background color="#374151" gap={16} size={1} />
                <Controls
                    className="bg-bg-surface border border-gray-700 shadow-xl rounded-lg overflow-hidden flex flex-col [&>button]:border-b [&>button]:border-gray-700 [&>button]:bg-bg-surface [&>button]:text-gray-300 hover:[&>button]:bg-white/10 [&>button]:transition-colors"
                    showInteractive={false}
                />
            </ReactFlow>
        </div>
    );
}
