import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown } from 'lucide-react';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';

type MonitorType = 'http' | 'tcp' | 'mysql' | 'mongodb' | 'icmp';

interface EditServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceName: string;
  currentEndpoint: string;
  currentHeaders?: Record<string, string>;
  currentIgnoreSSL?: boolean;
  currentLogPath?: string;
  currentInterval?: number;
  currentRetries?: number;
  type?: MonitorType;
}

export function EditServiceModal({
  isOpen,
  onClose,
  onSuccess,
  serviceName,
  currentEndpoint,
  currentHeaders,
  currentIgnoreSSL,
  currentInterval,
  currentRetries,
  type: initialType = 'http',
}: EditServiceModalProps): React.ReactNode {
  const [type, setType] = useState<MonitorType>(initialType);
  const [endpoint, setEndpoint] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('');
  const [ignoreSSL, setIgnoreSSL] = useState(false);
  const [interval, setInterval] = useState<number>(currentInterval ?? 30000);
  const [retries, setRetries] = useState<number>(currentRetries ?? 3);
  const [isIntervalOpen, setIsIntervalOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);

  const toast = useToast();
  
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      
      if (initialType === 'tcp') {
        const parts = currentEndpoint.split(':');
        if (parts.length >= 2) {
          setHostname(parts[0]);
          setPort(parts[1]);
        } else {
          setHostname(currentEndpoint);
          setPort('');
        }
      } else {
        // For HTTP / DB, keep logic for backward compat headers
        let fullEndpoint = currentEndpoint;
        if (currentHeaders && Object.keys(currentHeaders).length > 0) {
          const headerParts = Object.entries(currentHeaders)
            .map(([key, value]) => `${key}:${value}`)
            .join('|');
          fullEndpoint = `${currentEndpoint}|${headerParts}`;
        }
        setEndpoint(fullEndpoint);
      }
      
      setIgnoreSSL(currentIgnoreSSL || false);
      setInterval(currentInterval ?? 30000);
      setRetries(currentRetries ?? 3);
      setIsIntervalOpen(false);
    }
  }, [currentEndpoint, currentHeaders, currentIgnoreSSL, currentInterval, currentRetries, isOpen, initialType]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPanel  = dropdownPanelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setIsIntervalOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      let finalEndpoint = '';

      if (type === 'tcp') {
          if (!hostname.trim() || !port.trim()) {
              setError('Hostname and Port are required');
              return;
          }
          finalEndpoint = `${hostname.trim()}:${port.trim()}`;
      } else {
          if (!endpoint.trim()) {
              setError('Endpoint is required');
              return;
          }
          finalEndpoint = endpoint.trim();
          
          // Basic URL validation for HTTP
          if (type === 'http') {
              try {
                const baseUrl = finalEndpoint.includes('|') ? finalEndpoint.split('|')[0] : finalEndpoint;
                new URL(baseUrl);
              } catch {
                setError('Invalid endpoint URL');
                return;
              }
          }
      }

      // Pass the CURRENT type state to updateService
      // Note: We deliberately do NOT pass logPath here, as logs are managed via the Logs tab now.
      await apiClient.updateService(serviceName, finalEndpoint, type, ignoreSSL, undefined, undefined, interval, retries);

      toast.success('Service updated successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update service');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Edit Service</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
             {/* Monitor Type Selector */}
             <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-400 ml-1">
                  Monitor Type
                </label>
                <div className="relative group">
                   <select
                     value={type}
                     onChange={(e) => setType(e.target.value as MonitorType)}
                     className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all appearance-none cursor-pointer"
                   >
                      <option value="http">HTTP(s)</option>
                      <option value="tcp">TCP Port</option>
                      <option value="mysql">MySQL / MariaDB</option>
                      <option value="mongodb">MongoDB</option>
                   </select>
                </div>
             </div>

             <div>
                <label className="block text-sm font-medium text-gray-400 ml-1 mb-1.5">
                  Service Name
                </label>
                <input
                  type="text"
                  value={serviceName}
                  className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-gray-400 cursor-not-allowed"
                  disabled
                />
                <p className="mt-1.5 text-xs text-gray-500 pl-1">Service name cannot be changed</p>
             </div>

             {type === 'tcp' ? (
                <div className="flex gap-3">
                    <div className="space-y-1.5 flex-1">
                        <label className="block text-sm font-medium text-gray-400 ml-1">Hostname</label>
                        <input
                            type="text"
                            value={hostname}
                            onChange={(e) => setHostname(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="space-y-1.5 w-1/3">
                        <label className="block text-sm font-medium text-gray-400 ml-1">Port</label>
                        <input
                            type="number"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            disabled={isSubmitting}
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-400 ml-1">
                        {type === 'http' ? 'Endpoint URL | headers (optional)' : 'Connection String'}
                    </label>
                    <input
                        type="text"
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                        placeholder={type === 'http' ? "https://..." : type === 'mysql' ? "mysql://..." : "mongodb://..."}
                        className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                        disabled={isSubmitting}
                    />
                    {type === 'http' && (
                        <>
                             {/* Helper text moved up */}
                            <p className="mt-1.5 text-xs text-gray-500 pl-1">
                                Format: <code className="bg-white/5 px-1 py-0.5 rounded">url</code> or <code className="bg-white/5 px-1 py-0.5 rounded">url|Header:Value</code>
                            </p>
                            
                            <div className="flex items-center space-x-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="ignoreSSL"
                                    checked={ignoreSSL}
                                    onChange={(e) => setIgnoreSSL(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-600 bg-black/20 text-primary focus:ring-primary/50 cursor-pointer"
                                />
                                <label htmlFor="ignoreSSL" className="text-sm text-gray-400 cursor-pointer select-none">
                                    Ignore SSL/TLS Certificate Errors (Self-Signed)
                                </label>
                            </div>
                        </>
                    )}
                </div>
            )}
            
          </div>

          {/* Check Interval — Custom Dropdown (portal-rendered to escape overflow-hidden) */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-400 ml-1">Check Interval</label>
            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                  if (!isIntervalOpen && triggerRef.current) {
                    const r = triggerRef.current.getBoundingClientRect();
                    setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
                  }
                  setIsIntervalOpen(o => !o);
                }}
                disabled={isSubmitting}
                className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white flex items-center justify-between hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
              >
                <span className="text-sm">
                  {[
                    { value: 10000,  label: 'Every 10 seconds' },
                    { value: 30000,  label: 'Every 30 seconds (default)' },
                    { value: 60000,  label: 'Every 1 minute' },
                    { value: 300000, label: 'Every 5 minutes' },
                    { value: 600000, label: 'Every 10 minutes' },
                  ].find(o => o.value === interval)?.label ?? 'Every 30 seconds (default)'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isIntervalOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
             <label className="block text-sm font-medium text-gray-400 ml-1">Retries before alerting</label>
             <input
                 type="number"
                 min="1"
                 max="10"
                 value={retries}
                 onChange={(e) => setRetries(parseInt(e.target.value) || 3)}
                 className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                 disabled={isSubmitting}
             />
          </div>

          {/* Interval dropdown panel — portal to escape modal overflow */}
          {isIntervalOpen && dropdownRect && createPortal(
            <div
              ref={dropdownPanelRef}
              style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, zIndex: 9999 }}
              className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden"
            >
              {[
                { value: 10000,  label: 'Every 10 seconds' },
                { value: 30000,  label: 'Every 30 seconds (default)' },
                { value: 60000,  label: 'Every 1 minute' },
                { value: 300000, label: 'Every 5 minutes' },
                { value: 600000, label: 'Every 10 minutes' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setInterval(opt.value); setIsIntervalOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/20 ${
                    interval === opt.value ? 'text-primary font-medium' : 'text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>,
            document.body
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
