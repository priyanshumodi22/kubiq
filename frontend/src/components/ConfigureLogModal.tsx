import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { apiClient } from '../services/api';
import { useServices } from '../hooks/useServices';
import { useToast } from '../contexts/ToastContext';

interface ConfigureLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConfigureLogModal({ isOpen, onClose, onSuccess }: ConfigureLogModalProps) {
  const { services } = useServices();
  const toast = useToast();
  
  const [selectedServiceName, setSelectedServiceName] = useState('');
  const [logPath, setLogPath] = useState('');
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
      setSelectedServiceName('');
      setLogPath('');
      setError('');
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  }, [isOpen]);

  // When Service Selected, populate existing path if any
  useEffect(() => {
    if (selectedServiceName) {
      const svc = services.find(s => s.name === selectedServiceName);
      if (svc) {
        setLogPath(svc.logPath || '');
        // Also update search query to show selected name
        // setSearchQuery(svc.name); // Optional: depends if we want input to show name or remain filter
      }
    }
  }, [selectedServiceName, services]);


  if (!isOpen) return null;

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

      // We only update the logPath, keep other fields 
      await apiClient.updateService(
          service.name, 
          service.endpoint, 
          service.type, 
          service.ignoreSSL, 
          logPath // Update this
      );
      
      toast.success('Log path updated successfully');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update log path');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedServiceObj = services.find(s => s.name === selectedServiceName);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden" 
           style={{ minHeight: isDropdownOpen ? '500px' : 'auto' }} /* Expand if needed, or let overlay handle it. Actually better to let content overflow naturally or use fixed height logic if constrained. Let's stick to natural flow but ensure z-index */
      >
        
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Configure Logs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative" ref={dropdownRef}>
              <label className="block text-sm font-medium text-gray-400 ml-1 mb-1.5">Select Service</label>
              
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
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="p-2 border-b border-white/5">
                          <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search services..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-transparent rounded-lg py-1.5 px-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:bg-white/10 transition-colors"
                                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking input
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
                                          setSearchQuery(''); // Reset search on select? Or keep it? Reset is cleaner.
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

            <div>
              <label className="block text-sm font-medium text-gray-400 ml-1 mb-1.5">Log File Path</label>
              <input
                type="text"
                value={logPath}
                onChange={(e) => setLogPath(e.target.value)}
                placeholder="/var/log/app.log"
                className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono text-sm"
              />
               <p className="mt-1.5 text-xs text-gray-500 pl-1">
                  Absolute path on the backend server.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
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
              {isSubmitting ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
