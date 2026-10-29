import { createPortal } from 'react-dom';
import React, { useState, useEffect, useRef, useId } from 'react';
import { X, ChevronDown, Check, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { apiClient } from '../services/api';
import { useServices } from '../hooks/useServices';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { LogSource } from '../types';
import { apiErrorMessage } from '../utils/apiErrorMessage';

interface ConfigureLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preSelectedService?: string;
}

export function ConfigureLogModal({ isOpen, onClose, onSuccess, preSelectedService }: Readonly<ConfigureLogModalProps>) {
  const { services } = useServices();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const fieldId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [draftService, setDraftService] = useState<string | null>(null);
  
  const canEdit = hasPermission('services.manage') && hasPermission('logs.raw.read');
  
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
      setDraftService(null);
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
  useEffect(() => {
    if (selectedServiceName && isOpen && draftService !== selectedServiceName) {
      const svc = services.find(s => s.name === selectedServiceName);
      if (svc) {
        setDraftService(selectedServiceName);
        // Handle migration from legacy logPath in UI
        if (svc.logSources && svc.logSources.length > 0) {
            setLogSources(svc.logSources);
        } else {
            setLogSources([]);
        }
      }
    } else if (!selectedServiceName) {
        setLogSources([]);
        setDraftService(null);
    }
  }, [selectedServiceName, isOpen, services, draftService]);

  useEffect(() => {
    if (isDropdownOpen) inputRef.current?.focus();
  }, [isDropdownOpen]);

  const closeDropdown = () => {
    setIsDropdownOpen(false);
    triggerRef.current?.focus();
  };

  const optionKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'Escape') { event.preventDefault(); closeDropdown(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      optionRefs.current[(index + direction + filteredServices.length) % filteredServices.length]?.focus();
    }
  };


  if (!isOpen) return null;

  const handleAddSource = () => {
      if (!newLabel.trim() || !newPath.trim()) return;

      setLogSources(prev => [
          ...prev, 
          {
              id: Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join(''),
              name: newLabel.trim(),
              path: newPath.trim(),
              fileLimit: newLimit ? Number.parseInt(newLimit) : undefined
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
    if (!canEdit) {
      toast.warning('You do not have permission to perform this action.');
      return;
    }
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

      await apiClient.updateService(service.name, {
          endpoint: service.endpoint,
          type: service.type,
          ignoreSSL: service.ignoreSSL,
          logPath: primaryPath,
          logSources,
      });
      
      toast.success('Log configuration updated successfully');
      onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update log configuration'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedServiceObj = services.find(s => s.name === selectedServiceName);

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-bg-surface border border-white/10 rounded-2xl w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden text-sm">
        
        <div className="flex shrink-0 items-center justify-between p-4 sm:p-6 pb-4 bg-bg-surface">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent">Configure Log Sources</h2>
            {!canEdit && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 font-medium uppercase tracking-wide">
                    <ShieldAlert className="w-3 h-3" />
                    Read Only
                </span>
            )}
          </div>
          <button type="button" aria-label="Close log configuration" onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pt-2 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="relative" ref={dropdownRef}>
              <label htmlFor={`${fieldId}-service`} className="block text-xs font-medium text-gray-400 ml-1 mb-1.5 uppercase tracking-wide">Select Service</label>
              
              {/* Custom Dropdown Trigger */}
              <button type="button" id={`${fieldId}-service`} ref={triggerRef}
                aria-expanded={isDropdownOpen} aria-controls={isDropdownOpen ? `${fieldId}-options` : undefined}
                onClick={() => {
                    setIsDropdownOpen(!isDropdownOpen);
                }}
                onKeyDown={event => { if (event.key === 'Escape') closeDropdown(); }}
                className={`w-full bg-black/20 border ${isDropdownOpen ? 'border-primary/50 ring-2 ring-primary/20' : 'border-white/10'} rounded-xl py-3 px-4 text-white cursor-pointer flex items-center justify-between transition-all`}
              >
                  <span className={selectedServiceName ? 'text-white' : 'text-gray-500'}>
                      {selectedServiceObj ? `${selectedServiceObj.name} (${selectedServiceObj.endpoint})` : '-- Choose a Service --'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                  <div id={`${fieldId}-options`} className="absolute top-full left-0 right-0 mt-2 bg-[#1d1f24] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="p-2 border-b border-white/5">
                          <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search services..."
                                aria-label="Search services"
                                onKeyDown={event => {
                                  if (event.key === 'Escape') { event.preventDefault(); closeDropdown(); }
                                  if (event.key === 'ArrowDown') { event.preventDefault(); optionRefs.current[0]?.focus(); }
                                }}
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
                              filteredServices.map((s, index) => (
                                  <button type="button"
                                      ref={element => { optionRefs.current[index] = element; }}
                                      key={s.name}
                                      onKeyDown={event => optionKeyDown(event, index)}
                                      onClick={() => {
                                          setSelectedServiceName(s.name);
                                          closeDropdown();
                                          setSearchQuery(''); 
                                      }}
                                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 focus-visible:outline focus-visible:outline-primary transition-colors group"
                                  >
                                      <span className="min-w-0">
                                          <span className="block text-sm font-medium text-gray-200 group-hover:text-white truncate">{s.name}</span>
                                          <span className="block text-xs text-gray-500 truncate">{s.endpoint}</span>
                                      </span>
                                      {selectedServiceName === s.name && <Check className="w-4 h-4 text-primary" />}
                                  </button>
                              ))
                          )}
                      </div>
                  </div>
              )}
            </div>

            {/* Log Sources List */}
            <div>
              <h3 className="block text-xs font-medium text-gray-400 ml-1 mb-2 uppercase tracking-wide">Configured Logs</h3>
              
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
                          {canEdit && (
                            <button 
                                type="button"
                                aria-label={`Remove ${source.name}`}
                                onClick={() => handleRemoveSource(source.id)}
                                className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-white/5 rounded-md transition-colors mt-0.5"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                      </div>
                  ))}
                  
                  {logSources.length === 0 && (
                      <div className="text-center py-4 border border-dashed border-white/10 rounded-lg text-gray-500 italic">
                          No log sources configured yet.
                      </div>
                  )}
              </div>

              {/* Add New Source - Only visible if canEdit */}
              {canEdit && (
                <div className="bg-black/20 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="w-full sm:w-1/3">
                            <input
                                type="text"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="Label (e.g. Server)"
                                aria-label="Log source label"
                                className="w-full bg-white/5 border border-transparent rounded-lg py-2 px-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                            />
                        </div>
                        <div className="flex-1">
                            <input
                                type="text"
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                                placeholder="/path/to/logfile.log (or *.log)"
                                aria-label="Log source path"
                                className="w-full bg-white/5 border border-transparent rounded-lg py-2 px-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm"
                            />
                        </div>
                        <div className="w-full sm:w-20">
                            <input
                                type="number"
                                aria-label="Log source file limit"
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
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
            >
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit && (
                <button
                type="submit"
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20 transition-all duration-200 disabled:opacity-50"
                disabled={isSubmitting}
                >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
            )}
          </div>
        </form>
      </div>
    </div>, document.body
  );
}
