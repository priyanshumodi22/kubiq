import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { HealthCheck, ServicesStatusResponse, ServiceStatus, ServiceStatusUpdate, Stats } from '../types';

const POLL_INTERVAL = Number.parseInt(import.meta.env.VITE_POLL_INTERVAL || '5000', 10);
const FULL_DATA_INTERVAL = 30000;
const USE_SSE = import.meta.env.VITE_USE_SSE === 'true';

function visibleService(service: ServiceStatus, canReadRawLogs: boolean): ServiceStatus {
  if (canReadRawLogs) return service;
  const result = { ...service };
  delete result.logPath;
  delete result.logSources;
  return result;
}

function mergeStatus(previous: ServiceStatus[], updates: ServiceStatusUpdate[], canReadRawLogs: boolean) {
  return updates.map(update => {
    const existing = previous.find(service => service.name === update.name);
    return visibleService({
      ...existing,
      ...update,
      history: existing?.history || [],
      lastCheck: update.lastCheck ?? undefined,
      logPath: update.logPath || existing?.logPath,
      logSources: update.logSources || existing?.logSources,
    }, canReadRawLogs);
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function decodeSnapshot(message: string): ServicesStatusResponse {
  const value: unknown = JSON.parse(message);
  if (!value || typeof value !== 'object' || !('services' in value) || !Array.isArray(value.services)
    || !('stats' in value) || !value.stats || typeof value.stats !== 'object') {
    throw new Error('Invalid service stream snapshot');
  }
  for (const service of value.services) {
    if (!service || typeof service !== 'object' || typeof service.name !== 'string'
      || typeof service.endpoint !== 'string'
      || !['healthy', 'unhealthy', 'unknown'].includes(service.currentStatus)) {
      throw new Error('Invalid service stream entry');
    }
  }
  return value as ServicesStatusResponse;
}

export function useServices() {
  const { hasPermission, user, provider } = useAuth();
  const userId = user?.id;
  const canReadRawLogs = hasPermission('logs.raw.read');
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const generation = ++generationRef.current;
    let active = true;
    let statusInterval: ReturnType<typeof setInterval> | undefined;
    let source: EventSource | undefined;
    let statusPending = false;
    let fullPending = false;
    const current = () => active && generationRef.current === generation;
    setServices(previous => previous.map(service => visibleService(service, canReadRawLogs)));

    const applyStatus = (data: ServicesStatusResponse) => {
      if (!current()) return;
      setServices(previous => mergeStatus(previous, data.services, canReadRawLogs));
      setStats(data.stats);
      setError(null);
      setLoading(false);
    };
    const fetchStatus = async () => {
      if (!current() || statusPending) return;
      statusPending = true;
      try {
        applyStatus(await apiClient.getServicesStatus());
      } catch (failure) {
        if (current()) setError(errorMessage(failure, 'Failed to fetch status'));
      } finally {
        statusPending = false;
      }
    };
    const fetchServices = async () => {
      if (!current() || fullPending) return;
      fullPending = true;
      try {
        const data = await apiClient.getServices();
        if (current()) {
          setServices(data.services.map(service => visibleService(service, canReadRawLogs)));
          setStats(data.stats);
          setError(null);
        }
      } catch (failure) {
        if (current()) setError(errorMessage(failure, 'Failed to fetch services'));
      } finally {
        fullPending = false;
        if (current()) setLoading(false);
      }
    };
    const startPolling = () => {
      if (current() && statusInterval === undefined) {
        statusInterval = setInterval(() => { void fetchStatus(); }, POLL_INTERVAL);
      }
    };
    const fallback = () => {
      source?.close();
      startPolling();
    };
    refreshRef.current = fetchServices;
    void fetchServices();
    if (USE_SSE) {
      // Both login providers use the same credential and base URL as REST.
      const backend = import.meta.env.VITE_BACKEND_DNS || import.meta.env.VITE_API_BASE_URL || globalThis.location.origin;
      const context = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
      const token = apiClient.getToken();
      const query = token ? '?token=' + encodeURIComponent(token) : '';
      source = new EventSource(backend + context + '/api/services/stream' + query);
      source.onmessage = event => {
        if (!current()) return;
        try { applyStatus(decodeSnapshot(event.data)); } catch { fallback(); }
      };
      source.onerror = fallback;
    } else {
      startPolling();
    }
    const fullInterval = setInterval(() => { void fetchServices(); }, FULL_DATA_INTERVAL);
    return () => {
      active = false;
      if (statusInterval !== undefined) clearInterval(statusInterval);
      clearInterval(fullInterval);
      source?.close();
    };
  }, [canReadRawLogs, userId, provider]);

  const refresh = useCallback(() => {
    setLoading(true);
    void refreshRef.current();
  }, []);
  return { services, stats, loading, error, refresh };
}

export function useServiceHistory(serviceName: string | null, limit?: number) {
  const [history, setHistory] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const fetchHistory = useCallback(async () => {
    const generation = ++generationRef.current;
    if (!serviceName) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.getServiceHistory(serviceName, limit);
      if (generation === generationRef.current) {
        setHistory(data.history || []);
        setError(null);
      }
    } catch (failure) {
      if (generation === generationRef.current) setError(errorMessage(failure, 'Failed to fetch history'));
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [serviceName, limit]);
  const invalidateHistory = useCallback(() => { generationRef.current++; }, []);
  useEffect(() => {
    void fetchHistory();
    return invalidateHistory;
  }, [fetchHistory, invalidateHistory]);
  return { history, loading, error, refresh: fetchHistory };
}
