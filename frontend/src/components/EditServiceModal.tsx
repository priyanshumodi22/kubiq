import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../services/api';

type MonitorType = 'http' | 'tcp' | 'mysql' | 'mongodb' | 'icmp';

interface EditServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceName: string;
  currentEndpoint: string;
  currentHeaders?: Record<string, string>;
  type?: MonitorType;
}

export function EditServiceModal({
  isOpen,
  onClose,
  onSuccess,
  serviceName,
  currentEndpoint,
  currentHeaders,
  type: initialType = 'http', // Default to http
}: EditServiceModalProps) {
  const [type, setType] = useState<MonitorType>(initialType);
  const [endpoint, setEndpoint] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('');
  
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
        setError('');
    }
  }, [currentEndpoint, currentHeaders, isOpen, initialType]);

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
      await apiClient.updateService(serviceName, finalEndpoint, type);

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
                        <p className="mt-1.5 text-xs text-gray-500 pl-1">
                             Use <code>|Header:Value</code> to add headers
                        </p>
                    )}
                </div>
            )}
          </div>

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
