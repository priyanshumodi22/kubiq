import React, { useState, useEffect, useRef, useMemo } from 'react';

interface TimeRangeSliderProps {
    minMs: number;
    maxMs: number;
    value: [number, number];
    onChange: (value: [number, number]) => void;
}

export function TimeRangeSlider({ minMs, maxMs, value, onChange }: TimeRangeSliderProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<'from' | 'to' | null>(null);

    // Ensure values are within bounds
    const fromMs = Math.max(minMs, Math.min(value[0], maxMs));
    const toMs = Math.max(minMs, Math.min(value[1], maxMs));

    const getPercent = (ms: number) => {
        if (maxMs === minMs) return 0;
        return ((ms - minMs) / (maxMs - minMs)) * 100;
    };

    const handlePointerDown = (type: 'from' | 'to', e: React.PointerEvent) => {
        e.preventDefault();
        setIsDragging(type);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (!trackRef.current) return;
            
            const rect = trackRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const percentage = x / rect.width;
            
            let newMs = minMs + (maxMs - minMs) * percentage;
            
            // Snap to minutes roughly
            newMs = Math.round(newMs / 60000) * 60000;

            if (isDragging === 'from') {
                onChange([Math.min(newMs, toMs), toMs]);
            } else {
                onChange([fromMs, Math.max(newMs, fromMs)]);
            }
        };

        const handlePointerUp = () => {
            setIsDragging(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging, minMs, maxMs, fromMs, toMs, onChange]);

    // Generate ticks for the last 7 days
    const ticks = useMemo(() => {
        const now = new Date(maxMs);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const generatedTicks = [];
        // Add 7 day ticks
        for (let i = 7; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
            if (d.getTime() < minMs) continue;
            
            let label = '';
            if (i === 1) label = 'Yesterday';
            else if (i === 0) label = 'Today';
            else {
                label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                label = label.replace(',', '\n'); // Split into two lines for UI
            }
            generatedTicks.push({ value: d.getTime(), label });
        }
        
        // Add Now tick
        generatedTicks.push({ value: maxMs, label: 'Now' });
        
        return generatedTicks;
    }, [maxMs, minMs]);

    return (
        <div className="relative h-20 select-none mx-4 mt-6 mb-2">
            {/* Ticks and Labels */}
            <div className="absolute top-0 left-0 right-0 h-4">
                {ticks.map((tick, i) => (
                    <div 
                        key={i} 
                        className="absolute flex flex-col items-center -translate-x-1/2"
                        style={{ left: `${getPercent(tick.value)}%` }}
                    >
                        <div className="h-1.5 w-px bg-gray-600 mb-1"></div>
                        <span className="text-[10px] text-gray-500 whitespace-pre text-center leading-tight">
                            {tick.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* Track Background */}
            <div 
                ref={trackRef}
                className="absolute top-10 left-0 right-0 h-1.5 bg-gray-800 rounded-full cursor-pointer"
                onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                    const percentage = x / rect.width;
                    const clickMs = minMs + (maxMs - minMs) * percentage;
                    
                    // Determine which handle is closer
                    if (Math.abs(clickMs - fromMs) < Math.abs(clickMs - toMs)) {
                        setIsDragging('from');
                        onChange([clickMs, toMs]);
                    } else {
                        setIsDragging('to');
                        onChange([fromMs, clickMs]);
                    }
                }}
            >
                {/* Active Track Highlight */}
                <div 
                    className="absolute top-0 h-full bg-blue-500 rounded-full"
                    style={{ 
                        left: `${getPercent(Math.min(fromMs, toMs))}%`, 
                        width: `${Math.max(0, getPercent(Math.max(fromMs, toMs)) - getPercent(Math.min(fromMs, toMs)))}%` 
                    }}
                ></div>
            </div>

            {/* Left Handle */}
            <div 
                className="absolute top-[35px] w-5 h-5 bg-blue-500 rounded-full shadow-lg border border-white/20 -translate-x-1/2 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center hover:scale-110 transition-transform"
                style={{ left: `${getPercent(fromMs)}%` }}
                onPointerDown={(e) => handlePointerDown('from', e)}
            >
                <div className="w-0.5 h-2.5 bg-white/50 rounded-full"></div>
            </div>

            {/* Right Handle */}
            <div 
                className="absolute top-[35px] w-5 h-5 bg-blue-500 rounded-full shadow-lg border border-white/20 -translate-x-1/2 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center hover:scale-110 transition-transform"
                style={{ left: `${getPercent(toMs)}%` }}
                onPointerDown={(e) => handlePointerDown('to', e)}
            >
                <div className="w-0.5 h-2.5 bg-white/50 rounded-full"></div>
            </div>
        </div>
    );
}
