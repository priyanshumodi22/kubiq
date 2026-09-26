import { useState, useRef, useMemo, useEffect } from 'react';
import {
    Box, Globe, Settings,
    Search, ZoomIn, ZoomOut, Maximize2, Server, HelpCircle, Shield, Download
} from 'lucide-react';


interface K8sRelationshipMapProps {
    namespace: string;
    pods: any[];
    services: any[];
    ingresses: any[];
    configMaps: any[];
    secrets: any[];
    onSelectItem: (item: { type: string, data: any }) => void;
}

export function K8sRelationshipMap({
    namespace,
    pods = [],
    services = [],
    ingresses = [],
    configMaps = [],
    secrets = [],
    onSelectItem
}: K8sRelationshipMapProps) {

    // Zoom & Pan state
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scale on mount for mobile devices to show 2 columns initially
    useEffect(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.width < 640) {
            // Padding (60) + 2 columns (2 * 260) = 580px needed.
            const mobileScale = Math.max(0.4, Math.min(rect.width / 550, 1));
            setScale(mobileScale);
        }
    }, []);

    // Search & Hover Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    // Zoom handlers
    const handleZoomIn = () => setScale(s => Math.min(s + 0.1, 2));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.1, 0.5));
    const handleResetZoom = () => { setScale(1); setPan({ x: 0, y: 0 }); };

    // Pan handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        // Only drag if clicking the background SVG or standard non-interactive area
        const target = e.target as SVGElement;
        if (target.tagName === 'BUTTON' || target.closest('.node-card')) return;
        setIsDragging(true);
        dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    // Touch handlers for mobile panning
    const handleTouchStart = (e: React.TouchEvent) => {
        const target = e.target as SVGElement;
        if (target.tagName === 'BUTTON' || target.closest('.node-card')) return;
        if (e.touches.length === 1) {
            setIsDragging(true);
            dragStart.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        if (e.touches.length === 1) {
            setPan({
                x: e.touches[0].clientX - dragStart.current.x,
                y: e.touches[0].clientY - dragStart.current.y
            });
        }
    };

    const handleTouchEnd = () => setIsDragging(false);

    // Layout configuration
    const colWidth = 260;
    const paddingLeft = 60;

    // Column coordinates
    const xIngresses = paddingLeft;
    const xServices = paddingLeft + colWidth;
    const xPods = paddingLeft + colWidth * 2;
    const xConfigs = paddingLeft + colWidth * 3;

    // Calculate canvas size based on max nodes count
    const configsCount = configMaps.length + secrets.length;
    const maxItems = Math.max(ingresses.length, services.length, pods.length, configsCount, 1);
    const height = Math.max(maxItems * 105, 500);
    const width = paddingLeft + colWidth * 4;

    // Process nodes into layout list
    const nodes = useMemo(() => {
        const list: any[] = [];

        // 1. Ingresses
        const ingSpacing = height / (ingresses.length + 1);
        ingresses.forEach((ing, idx) => {
            list.push({
                id: `ingress-${ing.metadata?.name}`,
                type: 'ingresses',
                name: ing.metadata?.name,
                x: xIngresses,
                y: ingSpacing * (idx + 1),
                data: ing
            });
        });

        // 2. Services
        const svcSpacing = height / (services.length + 1);
        services.forEach((svc, idx) => {
            list.push({
                id: `service-${svc.metadata?.name}`,
                type: 'services',
                name: svc.metadata?.name,
                x: xServices,
                y: svcSpacing * (idx + 1),
                data: svc
            });
        });

        // 3. Pods
        const podSpacing = height / (pods.length + 1);
        pods.forEach((pod, idx) => {
            list.push({
                id: `pod-${pod.name}`,
                type: 'pods',
                name: pod.name,
                x: xPods,
                y: podSpacing * (idx + 1),
                data: pod
            });
        });

        // 4. Configs & Secrets combined
        const totalConfigs = configMaps.length + secrets.length;
        const configSpacing = height / (totalConfigs + 1);

        configMaps.forEach((cm, idx) => {
            list.push({
                id: `configmap-${cm.metadata?.name}`,
                type: 'configmaps',
                name: cm.metadata?.name,
                x: xConfigs,
                y: configSpacing * (idx + 1),
                data: cm
            });
        });

        secrets.forEach((sec, idx) => {
            list.push({
                id: `secret-${sec.metadata?.name}`,
                type: 'secrets',
                name: sec.metadata?.name,
                x: xConfigs,
                y: configSpacing * (configMaps.length + idx + 1),
                data: sec
            });
        });

        return list;
    }, [ingresses, services, pods, configMaps, secrets, height]);

    // Build relationship connections (Edges)
    const edges = useMemo(() => {
        const list: any[] = [];

        // 1. Match Ingresses to Services
        ingresses.forEach(ing => {
            const ingName = ing.metadata?.name;
            const rules = ing.spec?.rules || [];
            const targets: string[] = [];

            rules.forEach((rule: any) => {
                const paths = rule.http?.paths || [];
                paths.forEach((p: any) => {
                    if (p.backend?.service?.name) targets.push(p.backend.service.name);
                });
            });
            if (ing.spec?.defaultBackend?.service?.name) {
                targets.push(ing.spec.defaultBackend.service.name);
            }

            Array.from(new Set(targets)).forEach(svcName => {
                const source = nodes.find(n => n.id === `ingress-${ingName}`);
                const target = nodes.find(n => n.id === `service-${svcName}`);
                if (source && target) {
                    list.push({
                        id: `edge-ing-svc-${ingName}-${svcName}`,
                        sourceId: source.id,
                        targetId: target.id,
                        source,
                        target
                    });
                }
            });
        });

        // 2. Match Services to Pods
        services.forEach(svc => {
            const svcName = svc.metadata?.name;
            const selector = svc.spec?.selector;
            if (!selector || Object.keys(selector).length === 0) return;

            pods.forEach(pod => {
                const podLabels = pod.labels || {};
                const matches = Object.entries(selector).every(([k, v]) => podLabels[k] === v);
                if (matches) {
                    const source = nodes.find(n => n.id === `service-${svcName}`);
                    const target = nodes.find(n => n.id === `pod-${pod.name}`);
                    if (source && target) {
                        list.push({
                            id: `edge-svc-pod-${svcName}-${pod.name}`,
                            sourceId: source.id,
                            targetId: target.id,
                            source,
                            target
                        });
                    }
                }
            });
        });

        // 3. Match Pods to ConfigMaps / Secrets
        pods.forEach(pod => {
            // ConfigMaps references
            if (pod.refConfigMaps) {
                pod.refConfigMaps.forEach((cmName: string) => {
                    const source = nodes.find(n => n.id === `pod-${pod.name}`);
                    const target = nodes.find(n => n.id === `configmap-${cmName}`);
                    if (source && target) {
                        list.push({
                            id: `edge-pod-cm-${pod.name}-${cmName}`,
                            sourceId: source.id,
                            targetId: target.id,
                            source,
                            target
                        });
                    }
                });
            }

            // Secrets references
            if (pod.refSecrets) {
                pod.refSecrets.forEach((secName: string) => {
                    const source = nodes.find(n => n.id === `pod-${pod.name}`);
                    const target = nodes.find(n => n.id === `secret-${secName}`);
                    if (source && target) {
                        list.push({
                            id: `edge-pod-sec-${pod.name}-${secName}`,
                            sourceId: source.id,
                            targetId: target.id,
                            source,
                            target
                        });
                    }
                });
            }
        });

        return list;
    }, [ingresses, services, pods, nodes]);

    // Active Highlight calculations
    const activeTraceNodeIds = useMemo(() => {
        if (!hoveredNodeId) return new Set<string>();
        const trace = new Set<string>([hoveredNodeId]);

        edges.forEach(e => {
            if (e.sourceId === hoveredNodeId) {
                trace.add(e.targetId);
            }
            if (e.targetId === hoveredNodeId) {
                trace.add(e.sourceId);
            }
        });
        return trace;
    }, [hoveredNodeId, edges]);

    const activeTraceEdgeIds = useMemo(() => {
        if (!hoveredNodeId) return new Set<string>();
        const activeEdges = new Set<string>();
        edges.forEach(e => {
            if (activeTraceNodeIds.has(e.sourceId) && activeTraceNodeIds.has(e.targetId)) {
                activeEdges.add(e.id);
            }
        });
        return activeEdges;
    }, [hoveredNodeId, edges, activeTraceNodeIds]);



    // Render node icons helper
    const getNodeIcon = (type: string) => {
        switch (type) {
            case 'ingresses': return <Globe className="w-4 h-4 text-cyan-400" />;
            case 'services': return <Server className="w-4 h-4 text-emerald-400" />;
            case 'pods': return <Box className="w-4 h-4 text-primary" />;
            case 'configmaps': return <Settings className="w-4 h-4 text-amber-400" />;
            case 'secrets': return <Shield className="w-4 h-4 text-red-400" />;
            default: return <HelpCircle className="w-4 h-4 text-gray-400" />;
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative select-none">
            {/* Header Control Panel */}
            <div className="p-3 border-b border-gray-800 bg-[#1a1a1a] flex flex-col sm:flex-row items-stretch sm:items-center justify-between z-10 gap-3">
                <div className="flex items-center gap-2 justify-between sm:justify-start">
                    <span className="text-sm font-semibold text-white">Service Topology Map ({namespace})</span>
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full shrink-0">
                        {nodes.length} Nodes / {edges.length} Edges
                    </span>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    {/* Search bar */}
                    <div className="relative flex-1 sm:flex-initial">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Filter nodes..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-[#111111] border border-gray-700 text-xs text-white rounded-md pl-9 pr-4 py-1.5 focus:outline-none focus:border-primary/50 w-full sm:w-48 transition-all"
                        />
                    </div>

                    {/* Canvas controls */}
                    <div className="flex items-center gap-1.5 border-l border-gray-800 pl-4 shrink-0">
                        <button
                            onClick={handleZoomOut}
                            className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono text-gray-500 min-w-[32px] text-center">
                            {Math.round(scale * 100)}%
                        </span>
                        <button
                            onClick={handleZoomIn}
                            className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleResetZoom}
                            className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-colors"
                            title="Reset View"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>

                        <div className="h-4 w-px bg-gray-800 mx-1" />

                        <button
                            onClick={() => {
                                const escapeXml = (str: string) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                                const minW = Math.max(width, 1200);
                                const minH = Math.max(height, 800);
                                let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${minW}" height="${minH}" viewBox="0 0 ${minW} ${minH}" style="background-color: #0d0d0d; font-family: system-ui, -apple-system, sans-serif;">\n`;
                                svg += `<rect width="100%" height="100%" fill="#0d0d0d" />\n`;
                                svg += `<defs><pattern id="gridPattern" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/></pattern></defs>\n`;
                                svg += `<rect width="100%" height="100%" fill="url(#gridPattern)" />\n`;

                                // Draw Header
                                svg += `<text x="30" y="35" fill="#3b82f6" font-size="16" font-weight="bold">kubiq Kubernetes Topology Map</text>\n`;
                                svg += `<text x="30" y="52" fill="#888888" font-size="11">Namespace: ${escapeXml(namespace || 'default')} | Live Architecture Export</text>\n`;

                                // Draw Column Headers
                                svg += `<text x="${xIngresses}" y="75" fill="#6b7280" font-size="9" font-weight="bold" letter-spacing="1">HOSTS &amp; INGRESSES</text>\n`;
                                svg += `<text x="${xServices}" y="75" fill="#6b7280" font-size="9" font-weight="bold" letter-spacing="1">SERVICES</text>\n`;
                                svg += `<text x="${xPods}" y="75" fill="#6b7280" font-size="9" font-weight="bold" letter-spacing="1">PODS REPLICAS</text>\n`;
                                svg += `<text x="${xConfigs}" y="75" fill="#6b7280" font-size="9" font-weight="bold" letter-spacing="1">CONFIGURATIONS</text>\n`;
                                svg += `<line x1="30" y1="84" x2="${minW - 30}" y2="84" stroke="rgba(255,255,255,0.06)" stroke-width="1" />\n`;

                                // Draw Edges
                                edges.forEach(e => {
                                    const startX = e.source.x + 190;
                                    const startY = e.source.y + 24;
                                    const endX = e.target.x;
                                    const endY = e.target.y + 24;
                                    const dx = endX - startX;
                                    const controlX1 = startX + dx * 0.3;
                                    const controlX2 = endX - dx * 0.3;
                                    const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;
                                    svg += `<path d="${pathData}" fill="none" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 4" />\n`;
                                });

                                // Draw Nodes
                                nodes.forEach(n => {
                                    const isPod = n.type === 'pods';
                                    const podReady = isPod && n.data?.ready;

                                    const rawStatus = isPod
                                        ? (typeof n.data?.status === 'string'
                                            ? n.data.status
                                            : typeof n.data?.status?.phase === 'string'
                                                ? n.data.status.phase
                                                : podReady ? 'Running' : 'Active')
                                        : n.type === 'ingresses'
                                            ? (n.data?.spec?.rules?.[0]?.host || 'Local Route')
                                            : (n.type.charAt(0).toUpperCase() + n.type.slice(1));

                                    let cardBg = '#161616';
                                    let cardStroke = '#262626';
                                    let statusDotColor = '#3b82f6';

                                    if (isPod) {
                                        if (rawStatus.toLowerCase().includes('running') || podReady) {
                                            cardBg = '#091b12';
                                            cardStroke = 'rgba(16, 185, 129, 0.4)';
                                            statusDotColor = '#4ade80';
                                        } else if (rawStatus.toLowerCase().includes('pending')) {
                                            cardBg = '#1f1609';
                                            cardStroke = 'rgba(245, 158, 11, 0.4)';
                                            statusDotColor = '#fbbf24';
                                        } else {
                                            cardBg = '#220b0b';
                                            cardStroke = 'rgba(239, 68, 68, 0.4)';
                                            statusDotColor = '#f87171';
                                        }
                                    } else {
                                        if (n.type === 'ingresses') statusDotColor = '#22d3ee';
                                        else if (n.type === 'services') statusDotColor = '#34d399';
                                        else if (n.type === 'configmaps') statusDotColor = '#fbbf24';
                                        else if (n.type === 'secrets') statusDotColor = '#f87171';
                                    }

                                    const cleanName = escapeXml((n.name || '').toUpperCase().slice(0, 18));
                                    const cleanStatus = escapeXml(rawStatus);

                                    // Exact Lucide SVG vector paths matching live UI icons
                                    let iconSvg = '';
                                    if (n.type === 'ingresses') {
                                        // Globe (cyan-400)
                                        iconSvg = `<svg x="16" y="16" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
                                    } else if (n.type === 'services') {
                                        // Server (emerald-400)
                                        iconSvg = `<svg x="16" y="16" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>`;
                                    } else if (n.type === 'pods') {
                                        // Box (sky-400 / primary)
                                        iconSvg = `<svg x="16" y="16" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
                                    } else if (n.type === 'configmaps') {
                                        // Settings (amber-400)
                                        iconSvg = `<svg x="16" y="16" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
                                    } else if (n.type === 'secrets') {
                                        // Shield (red-400)
                                        iconSvg = `<svg x="16" y="16" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`;
                                    } else {
                                        // HelpCircle
                                        iconSvg = `<svg x="16" y="16" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;
                                    }

                                    svg += `<g transform="translate(${n.x}, ${n.y})">\n`;
                                    svg += `  <rect width="190" height="48" rx="12" fill="${cardBg}" stroke="${cardStroke}" stroke-width="1.2" />\n`;
                                    svg += `  <rect x="8" y="8" width="32" height="32" rx="8" fill="#000000" fill-opacity="0.35" stroke="#ffffff" stroke-opacity="0.05" />\n`;
                                    svg += `  ${iconSvg}\n`;
                                    svg += `  <text x="48" y="22" fill="#ffffff" font-size="10" font-weight="bold" letter-spacing="0.5">${cleanName}</text>\n`;
                                    svg += `  <circle cx="52" cy="34" r="3" fill="${statusDotColor}" />\n`;
                                    svg += `  <text x="60" y="37" fill="#9ca3af" font-size="9" font-family="monospace">${cleanStatus}</text>\n`;
                                    svg += `</g>\n`;
                                });

                                svg += `</svg>`;

                                const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `kubiq-topology-${namespace || 'cluster'}-${Date.now()}.svg`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-xs transition-colors border border-white/10"
                            title="Export Cluster Topology as SVG Architecture Diagram"
                        >
                            <Download className="w-3.5 h-3.5 text-primary" />
                            <span className="hidden sm:inline">Export SVG</span>
                        </button>
                    </div>
                </div>
            </div>


            {/* Layout Column Headers (Synced with Canvas X-Axis) */}
            <div className="border-b border-gray-900 bg-black/25 relative z-10 overflow-hidden shrink-0 h-8 select-none pointer-events-none">
                <div
                    className="absolute top-0 bottom-0 left-0 text-[10px] uppercase font-bold tracking-wider text-gray-500 whitespace-nowrap"
                    style={{
                        transform: `translateX(${pan.x}px)`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                    }}
                >
                    <div className="absolute top-2" style={{ left: `${xIngresses * scale}px`, transition: isDragging ? 'none' : 'left 0.15s ease-out' }}>Hosts & Ingresses</div>
                    <div className="absolute top-2" style={{ left: `${xServices * scale}px`, transition: isDragging ? 'none' : 'left 0.15s ease-out' }}>Services</div>
                    <div className="absolute top-2" style={{ left: `${xPods * scale}px`, transition: isDragging ? 'none' : 'left 0.15s ease-out' }}>Pods Replicas</div>
                    <div className="absolute top-2" style={{ left: `${xConfigs * scale}px`, transition: isDragging ? 'none' : 'left 0.15s ease-out' }}>Configurations</div>
                </div>
            </div>

            {/* Topology Canvas Area */}
            <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className="flex-1 overflow-hidden bg-[#0d0d0d] relative cursor-grab active:cursor-grabbing touch-none"
            >
                {/* Single transformed wrapper for perfect SVG & Card coordinate alignment */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: `${width}px`,
                        height: `${height}px`,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transformOrigin: '0 0',
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                    }}
                >
                    {/* SVG Graph connections */}
                    <svg
                        width={width}
                        height={height}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none'
                        }}
                    >
                        <defs>
                            {/* Glow filters */}
                            <filter id="glow-glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Animated active paths */}
                        {edges.map(edge => {
                            const isEdgeTrace = hoveredNodeId && activeTraceEdgeIds.has(edge.id);
                            if (!isEdgeTrace) return null;

                            const startX = edge.source.x + 190;
                            const startY = edge.source.y + 24;
                            const endX = edge.target.x;
                            const endY = edge.target.y + 24;

                            const dx = endX - startX;
                            const controlX1 = startX + dx * 0.3;
                            const controlX2 = endX - dx * 0.3;
                            const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;

                            return (
                                <g key={`active-${edge.id}`}>
                                    <path
                                        d={pathData}
                                        fill="none"
                                        stroke="rgba(0, 240, 255, 0.25)"
                                        strokeWidth={6}
                                        filter="url(#glow-glow)"
                                    />
                                    <path
                                        d={pathData}
                                        fill="none"
                                        stroke="#00f0ff"
                                        strokeWidth={2.5}
                                        className="animate-[dash_10s_linear_infinite]"
                                    />
                                </g>
                            );
                        })}

                        {/* Standard inactive paths */}
                        {edges.map(edge => {
                            const isEdgeTrace = hoveredNodeId && activeTraceEdgeIds.has(edge.id);
                            if (isEdgeTrace) return null;

                            const startX = edge.source.x + 190;
                            const startY = edge.source.y + 24;
                            const endX = edge.target.x;
                            const endY = edge.target.y + 24;

                            const dx = endX - startX;
                            const controlX1 = startX + dx * 0.3;
                            const controlX2 = endX - dx * 0.3;
                            const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;

                            return (
                                <path
                                    key={edge.id}
                                    d={pathData}
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.12)"
                                    strokeWidth={1.5}
                                    strokeDasharray="3 3"
                                    className="transition-all"
                                />
                            );
                        })}

                        {/* Highlighted glowing active paths */}
                        {hoveredNodeId && edges.map(edge => {
                            const isNodeTrace = activeTraceEdgeIds.has(edge.id);
                            if (!isNodeTrace) return null;

                            const startX = edge.source.x + 190;
                            const startY = edge.source.y + 24;
                            const endX = edge.target.x;
                            const endY = edge.target.y + 24;

                            const dx = endX - startX;
                            const controlX1 = startX + dx * 0.3;
                            const controlX2 = endX - dx * 0.3;
                            const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;

                            return (
                                <g key={`active-${edge.id}`}>
                                    <path
                                        d={pathData}
                                        fill="none"
                                        stroke="rgba(0, 240, 255, 0.25)"
                                        strokeWidth={6}
                                        filter="url(#glow-glow)"
                                    />
                                    <path
                                        d={pathData}
                                        fill="none"
                                        stroke="#00f0ff"
                                        strokeWidth={2.5}
                                        className="animate-[dash_10s_linear_infinite]"
                                    />
                                </g>
                            );
                        })}
                    </svg>

                    {/* CSS Animation style block for dashed edges */}
                    <style>{`
                        @keyframes dash {
                            to {
                                stroke-dashoffset: -100;
                            }
                        }
                    `}</style>

                    {/* DOM Node cards placed on top of SVG */}
                    {nodes.map(node => {
                        const isNodeTrace = !hoveredNodeId || activeTraceNodeIds.has(node.id);
                        const isFiltered = searchQuery && !node.name.toLowerCase().includes(searchQuery.toLowerCase());
                        const isPod = node.type === 'pods';
                        const podReady = isPod && node.data.ready;

                        // Pod status-specific backgrounds
                        let statusColor = 'border-gray-800 bg-[#161616]';
                        if (isPod) {
                            if (node.data.status?.toLowerCase().includes('running') || podReady) {
                                statusColor = 'border-emerald-500/30 bg-emerald-950/15';
                            } else if (node.data.status?.toLowerCase().includes('pending')) {
                                statusColor = 'border-amber-500/30 bg-amber-950/15';
                            } else {
                                statusColor = 'border-red-500/30 bg-red-950/15';
                            }
                        }

                        return (
                            <div
                                key={node.id}
                                className="node-card absolute pointer-events-auto"
                                style={{
                                    left: `${node.x}px`,
                                    top: `${node.y}px`,
                                    width: '190px',
                                    height: '48px',
                                    zIndex: hoveredNodeId === node.id ? 50 : 10
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onSelectItem({ type: node.type, data: node.data })}
                                    onMouseEnter={() => setHoveredNodeId(node.id)}
                                    onMouseLeave={() => setHoveredNodeId(null)}
                                    onTouchStart={() => setHoveredNodeId(node.id)}
                                    onTouchEnd={() => setHoveredNodeId(null)}
                                    onTouchCancel={() => setHoveredNodeId(null)}
                                    className={`
                                        w-full h-full text-left rounded-xl border p-2 flex items-center gap-2.5 
                                        transition-all duration-300 backdrop-blur-md shadow-lg
                                        hover:scale-[1.03] hover:shadow-black/60
                                        ${hoveredNodeId === node.id
                                            ? 'border-primary bg-primary/10 shadow-primary/20 scale-[1.02]'
                                            : isNodeTrace && !isFiltered
                                                ? `${statusColor} text-gray-100 hover:border-gray-600`
                                                : 'border-gray-900/60 bg-[#141414]/30 text-gray-500 opacity-25'
                                        }
                                    `}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-black/35 flex items-center justify-center shrink-0 border border-white/[0.04]">
                                        {getNodeIcon(node.type)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[11px] font-bold truncate text-white uppercase tracking-wider">{node.name}</div>
                                        {isPod ? (
                                            <div className="text-[9px] font-mono text-gray-400 mt-0.5 truncate flex items-center gap-1">
                                                <span className={`w-1.5 h-1.5 rounded-full ${podReady ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
                                                <span>
                                                    {typeof node.data.status === 'string'
                                                        ? node.data.status
                                                        : typeof node.data.status?.phase === 'string'
                                                            ? node.data.status.phase
                                                            : podReady ? 'Running' : 'Active'}
                                                </span>
                                            </div>
                                        ) : node.type === 'ingresses' ? (
                                            <div className="text-[9px] font-mono text-gray-400 mt-0.5 truncate">
                                                {node.data.spec?.rules?.[0]?.host || 'Local Route'}
                                            </div>
                                        ) : (
                                            <div className="text-[9px] font-mono text-gray-400 mt-0.5 truncate capitalize">
                                                {node.type.replace('persistent', 'Persistent ')}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
