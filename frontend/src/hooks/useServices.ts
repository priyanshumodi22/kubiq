import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const POLL_INTERVAL = parseInt(import.meta.env.VITE_POLL_INTERVAL || '5000', 10);
const FULL_DATA_INTERVAL = 30000; // Fetch full data every 30 seconds
const USE_SSE = import.meta.env.VITE_USE_SSE === 'true'; // Optional SSE support

export function useServices() {
  const { keycloak } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fullDataIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isMountedRef = useRef(true);

  // Fetch lightweight status updates
  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiClient.getServicesStatus();

      if (isMountedRef.current) {
        // Update only status fields, preserve history
        setServices((prevServices) => {
          return data.services.map((statusUpdate: any) => {
            const existing = prevServices.find((s) => s.name === statusUpdate.name);
            // Ensure we don't lose logPath/logSources if the lightweight status update doesn't have it
            return existing 
                ? { 
                    ...existing, 
                    ...statusUpdate, 
                    logPath: statusUpdate.logPath || existing.logPath,
                    logSources: statusUpdate.logSources || existing.logSources
                  } 
                : statusUpdate;
          });
        });
        setStats(data.stats || null);
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch status');
      }
    }
  }, []);

  // Fetch full data including history
  const fetchServices = useCallback(async () => {
    try {
      const data = await apiClient.getServices();

      if (isMountedRef.current) {
        setServices(data.services || []);
        setStats(data.stats || null);
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch services');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Setup SSE connection
  const setupSSE = useCallback(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_DNS || window.location.origin;
    const contextPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '/kubiq-api';

    // Add token to URL query parameter for SSE authentication
    const token = keycloak?.token || '';
    const sseUrl = `${backendUrl}${contextPath}/api/services/stream${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (isMountedRef.current) {
        setServices((prevServices) => {
          return data.services.map((statusUpdate: any) => {
            const existing = prevServices.find((s: any) => s.name === statusUpdate.name);
            return existing 
                ? { ...existing, ...statusUpdate, logPath: statusUpdate.logPath || existing.logPath } 
                : statusUpdate;
          });
        });
        setStats(data.stats || null);
        setError(null);
        setLoading(false);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error, falling back to polling');
      eventSource.close();
      // Fall back to polling on error
      statusIntervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    };

    return eventSource;
  }, [fetchStatus, keycloak]);

  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch of full data
    fetchServices();

    if (USE_SSE) {
      // Use SSE for real-time updates
      eventSourceRef.current = setupSSE();
      // Still fetch full data periodically for history
      fullDataIntervalRef.current = setInterval(fetchServices, FULL_DATA_INTERVAL);
    } else {
      // Dual polling: status frequent, full data occasional
      statusIntervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
      fullDataIntervalRef.current = setInterval(fetchServices, FULL_DATA_INTERVAL);
    }

    return () => {
      isMountedRef.current = false;
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (fullDataIntervalRef.current) {
        clearInterval(fullDataIntervalRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - functions are stable due to refs

  const refresh = useCallback(() => {
    setLoading(true);
    fetchServices();
  }, [fetchServices]);

  return { services, stats, loading, error, refresh };
}

export function useServiceHistory(serviceName: string | null, limit?: number) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!serviceName) return;

    setLoading(true);
    try {
      const data = await apiClient.getServiceHistory(serviceName, limit);
      setHistory(data.history || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, [serviceName, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}
