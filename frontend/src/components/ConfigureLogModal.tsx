import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Check, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '../services/api';
import { useServices } from '../hooks/useServices';
import { useToast } from '../contexts/ToastContext';
import { LogSource } from '../types';

interface ConfigureLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preSelectedService?: string;
}

export function ConfigureLogModal({ isOpen, onClose, onSuccess, preSelectedService }: ConfigureLogModalProps) {
  const { services } = useServices();
  const toast = useToast();
  
  const [selectedServiceName, setSelectedServiceName] = useState('');
  
  // State for multiple logs
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  
  // New Entry State
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newLimit, setNewLimit] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter services based on search query
  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.endpoint.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedServiceName(preSelectedService || '');
      // Log sources will be populated by the next effect
      setNewLabel('');
      setNewPath('');
      setNewLimit('');
      setError('');
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  }, [isOpen, preSelectedService]);

  // When Service Selected, populate existing
  // When Service Selected, populate existing ONE TIME
  useEffect(() => {
    if (selectedServiceName && isOpen) {
      const svc = services.find(s => s.name === selectedServiceName);
      if (svc) {
        // Handle migration from legacy logPath in UI
        if (svc.logSources && svc.logSources.length > 0) {
            setLogSources(svc.logSources);
        } else {
            setLogSources([]);
        }
      }
    } else {
        // Only clear if we are closing or switching to nothing? 
        // Actually, if we switch service, we want to clear.
        if (!selectedServiceName) setLogSources([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceName, isOpen]); // Remove 'services' dependency to prevent overwrite during edits!


  if (!isOpen) return null;

  const handleAddSource = () => {
      if (!newLabel.trim() || !newPath.trim()) return;

      setLogSources(prev => [
          ...prev, 
          {
              id: Date.now().toString(),
              name: newLabel.trim(),
              path: newPath.trim(),
              fileLimit: newLimit ? parseInt(newLimit) : undefined
          }
      ]);
      setNewLabel('');
      setNewPath('');
      setNewLimit('');
  };

  const handleRemoveSource = (id: string) => {
      setLogSources(prev => prev.filter(s => s.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceName) {
        setError("Please select a service");
        return;
    }
    
    setIsSubmitting(true);
    setError('');

    try {
      const service = services.find(s => s.name === selectedServiceName);
      if (!service) throw new Error("Service not found");

      // Deprecate logPath by sending empty string.
      const primaryPath = ''; // Force clear legacy path logic

      await apiClient.updateService(
          service.name, 
          service.endpoint, 
          service.type, 
          service.ignoreSSL, 
          primaryPath, 
          logSources
      );
      
      toast.success('Log configuration updated successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update log configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedServiceObj = services.find(s => s.name === selectedServiceName);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden text-sm">
        
        <div className="flex items-center justify-between p-6 pb-4 bg-[#1a1a1a]">
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Configure Log Sources</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-medium text-gray-400 ml-1 mb-1.5 uppercase tracking-wide">Select Service</label>
              
              {/* Custom Dropdown Trigger */}
              <div 
                onClick={() => {
                    setIsDropdownOpen(!isDropdownOpen);
                    if (!isDropdownOpen) {
                        setTimeout(() => inputRef.current?.focus(), 50);
                    }
                }}
                className={`w-full bg-black/20 border ${isDropdownOpen ? 'border-primary/50 ring-2 ring-primary/20' : 'border-white/10'} rounded-xl py-3 px-4 text-white cursor-pointer flex items-center justify-between transition-all`}
              >
                  <span className={selectedServiceName ? 'text-white' : 'text-gray-500'}>
                      {selectedServiceObj ? `${selectedServiceObj.name} (${selectedServiceObj.endpoint})` : '-- Choose a Service --'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#1d1f24] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="p-2 border-b border-white/5">
                          <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search services..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-transparent rounded-lg py-1.5 px-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:bg-white/10 transition-colors"
                                onClick={(e) => e.stopPropagation()} 
                          />
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                          {filteredServices.length === 0 ? (
                              <div className="py-3 text-center text-sm text-gray-500">No services found</div>
                          ) : (
                              filteredServices.map(s => (
                                  <div
                                      key={s.name}
                                      onClick={() => {
                                          setSelectedServiceName(s.name);
                                          setIsDropdownOpen(false);
                                          setSearchQuery(''); 
                                      }}
                                      className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors group"
                                  >
                                      <div className="min-w-0">
                                          <div className="text-sm font-medium text-gray-200 group-hover:text-white truncate">{s.name}</div>
                                          <div className="text-xs text-gray-500 truncate">{s.endpoint}</div>
                                      </div>
                                      {selectedServiceName === s.name && <Check className="w-4 h-4 text-primary" />}
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              )}
            </div>

            {/* Log Sources List */}
            <div>
              <label className="block text-xs font-medium text-gray-400 ml-1 mb-2 uppercase tracking-wide">Configured Logs</label>
              
              <div className="space-y-2 mb-3">
                  {logSources.map((source) => (
                      <div key={source.id} className="flex items-start justify-between bg-white/5 border border-white/5 rounded-lg px-3 py-2 group hover:border-white/10 transition-colors">
                          <div className="min-w-0 flex-1 mr-4">
                              <div className="text-sm font-medium text-white">
                                  {source.name}
                                  {source.fileLimit && <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Limit: {source.fileLimit}</span>}
                              </div>
                              <div className="text-xs text-gray-500 font-mono truncate" title={source.path}>{source.path}</div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => handleRemoveSource(source.id)}
                            className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-white/5 rounded-md transition-colors mt-0.5"
                          >
                              <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                  ))}
                  
                  {logSources.length === 0 && (
                      <div className="text-center py-4 border border-dashed border-white/10 rounded-lg text-gray-500 italic">
                          No log sources configured yet.
                      </div>
                  )}
              </div>

              {/* Add New Source */}
              <div className="bg-black/20 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                  <div className="flex gap-3">
                      <div className="w-1/3">
                          <input
                            type="text"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Label (e.g. Server)"
                            className="w-full bg-white/5 border border-transparent rounded-lg py-2 px-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                          />
                      </div>
                      <div className="flex-1">
                          <input
                            type="text"
                            value={newPath}
                            onChange={(e) => setNewPath(e.target.value)}
                            placeholder="/path/to/logfile.log (or *.log)"
                            className="w-full bg-white/5 border border-transparent rounded-lg py-2 px-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm"
                          />
                      </div>
                      <div className="w-20">
                           <input
                            type="number"
                            min="1"
                            max="50"
                            value={newLimit}
                            onChange={(e) => setNewLimit(e.target.value)}
                            placeholder="N"
                            title="Limit number of files for glob patterns"
                            className="w-full bg-white/5 border border-transparent rounded-lg py-2 px-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 text-center text-sm"
                          />
                      </div>
                  </div>
                   <button
                      type="button"
                      onClick={handleAddSource}
                      disabled={!newLabel || !newPath}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium uppercase tracking-wider"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Log Source
                  </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
