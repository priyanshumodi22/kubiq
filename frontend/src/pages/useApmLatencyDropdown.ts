import { useEffect, useRef, useState } from 'react';

// Each mounted picker owns its trigger, portal and open state.
export function useApmLatencyDropdown() {
    const latencyTriggerRef = useRef<HTMLButtonElement>(null);
    const latencyPanelRef = useRef<HTMLDivElement>(null);
    const [isLatencyOpen, setIsLatencyOpen] = useState(false);
    const [latencyRect, setLatencyRect] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        if (!isLatencyOpen) return;
        const outside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!latencyTriggerRef.current?.contains(target) && !latencyPanelRef.current?.contains(target)) setIsLatencyOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setIsLatencyOpen(false);
            latencyTriggerRef.current?.focus();
        };
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [isLatencyOpen]);

    return { latencyTriggerRef, latencyPanelRef, isLatencyOpen, setIsLatencyOpen, latencyRect, setLatencyRect };
}
