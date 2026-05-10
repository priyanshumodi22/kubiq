
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Server, Link as LinkIcon, AlertCircle, Database, Activity, ChevronDown } from 'lucide-react';
import { apiClient } from '../services/api';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type MonitorType = 'http' | 'tcp' | 'mysql' | 'mongodb';

export function AddServiceModal({ isOpen, onClose, onSuccess }: AddServiceModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MonitorType>('http');
  const [endpoint, setEndpoint] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('');
  const [interval, setInterval] = useState<number>(30000);
  const [retries, setRetries] = useState<number>(3);
  const [isIntervalOpen, setIsIntervalOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      // Validate inputs
      if (!name.trim()) {
        setError('Service Name is required');
        return;
      }

      let finalEndpoint = '';

      if (type === 'tcp') {
          if (!hostname.trim() || !port.trim()) {
              setError('Hostname and Port are required for TCP monitoring');
              return;
          }
          finalEndpoint = `${hostname.trim()}:${port.trim()}`;
      } else {
          // HTTP / Database
          if (!endpoint.trim()) {
             setError(type === 'http' ? 'Endpoint URL is required' : 'Connection String is required');
             return;
          }
          finalEndpoint = endpoint.trim();
      }

      // Basic Validation depending on type
      if (type === 'http') {
          try {
            const baseUrl = finalEndpoint.includes('|') ? finalEndpoint.split('|')[0] : finalEndpoint;
            new URL(baseUrl);
          } catch {
            setError('Invalid endpoint URL');
            return;
          }
      }

      await apiClient.createService(name.trim(), finalEndpoint, type, interval, retries);

      // Reset form and close
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEndpoint('');
    setHostname('');
    setPort('');
    setType('http');
    setInterval(30000);
    setRetries(3);
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Add New Service</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
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
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
                      <Activity className="w-5 h-5" />
                   </div>
                   <select
                     value={type}
                     onChange={(e) => setType(e.target.value as MonitorType)}
                     className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all appearance-none cursor-pointer"
                   >
                      <option value="http">HTTP(s)</option>
                      <option value="tcp">TCP Port</option>
                      <option value="mysql">MySQL / MariaDB</option>
                      <option value="mongodb">MongoDB</option>
                   </select>
                </div>
             </div>

            <div className="space-y-1.5">
              <label htmlFor="serviceName" className="block text-sm font-medium text-gray-400 ml-1">
                Friendly Name
              </label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
                  <Server className="w-5 h-5" />
                </div>
                <input
                  id="serviceName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production DB"
                  className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* TCP Inputs */}
            {type === 'tcp' && (
                <div className="flex gap-3">
                    <div className="space-y-1.5 flex-1">
                        <label className="block text-sm font-medium text-gray-400 ml-1">Hostname</label>
                        <input
                            type="text"
                            value={hostname}
                            onChange={(e) => setHostname(e.target.value)}
                            placeholder="e.g. 192.168.1.100"
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
                            placeholder="3306"
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            disabled={isSubmitting}
                        />
                    </div>
                </div>
            )}

            {/* HTTP / DB Inputs */}
            {type !== 'tcp' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="serviceEndpoint"
                    className="block text-sm font-medium text-gray-400 ml-1"
                  >
                    {type === 'http' ? 'Endpoint URL' : 'Connection String'}
                    {type === 'http' && <span className="text-gray-600"> | headers (optional)</span>}
                  </label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
                      {type === 'http' ? <LinkIcon className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                    </div>
                    <input
                      id="serviceEndpoint"
                      type="text"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder={
                          type === 'http' ? "https://api.example.com/health" :
                          type === 'mysql' ? "mysql://user:pass@host:3306" :
                          "mongodb://user:pass@host:27017"
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                      disabled={isSubmitting}
                    />
                  </div>
                  {type === 'http' && (
                    <p className="mt-1.5 text-xs text-gray-500 pl-1">
                        Format: <code className="bg-white/5 px-1 py-0.5 rounded">url</code> or <code className="bg-white/5 px-1 py-0.5 rounded">url|Header:Value</code>
                    </p>
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

          {/* Interval dropdown panel — rendered via portal so it escapes modal overflow */}
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
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                 <>
                   <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                   Adding...
                 </>
              ) : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
