import { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import { apiClient } from '../services/api';
import { ServiceStatus } from '../types';

interface EditLogDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  service: ServiceStatus;
}

export function EditLogDialog({
  isOpen,
  onClose,
  onSuccess,
  service,
}: EditLogDialogProps) {
  const [logPath, setLogPath] = useState(service.logPath || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLogPath(service.logPath || '');
      setError('');
    }
  }, [isOpen, service]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!logPath.trim()) {
      setError('Log path cannot be empty');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      // We must pass all service properties properly to avoid overwriting them with invalid data
      // API expects: name, endpoint, type, ignoreSSL, logPath
      await apiClient.updateService(
        service.name,
        service.endpoint,
        service.type,
        service.ignoreSSL,
        logPath.trim()
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to update log configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-sm border border-gray-800 flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Subtle Gradient Glow at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/20 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-primary/20 to-transparent blur-3xl opacity-20" />

        <div className="p-6 w-full flex flex-col items-center">
        
        {/* Icon Circle */}
        <div className="w-16 h-16 rounded-full bg-bg-surface flex items-center justify-center mb-6 border border-gray-800">
          <Edit2 className="w-8 h-8 text-primary" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-2">Edit Log Source</h2>

        {/* Description */}
        <p className="text-gray-400 text-sm mb-6">
          Update the log file path for <span className="font-semibold text-white">"{service.name}"</span>
        </p>

        {/* Input */}
        <div className="w-full mb-6 text-left">
           <label className="text-xs font-medium text-gray-500 ml-1 mb-1.5 block">Log File Path</label>
           <input
             type="text"
             value={logPath}
             onChange={(e) => setLogPath(e.target.value)}
             placeholder="/var/log/app.log"
             className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all font-mono text-sm"
             disabled={isSaving}
             autoFocus
           />
        </div>
          
        {error && (
            <div className="w-full text-red-400 text-xs bg-red-500/10 p-2 rounded border border-red-500/20 mb-6">
              {error}
            </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-3 px-4 bg-transparent border border-gray-700 hover:border-gray-600 text-white rounded-xl transition-all font-medium text-sm"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 px-4 bg-primary hover:bg-primary/80 border border-primary/50 text-white rounded-xl transition-all font-medium text-sm shadow-lg shadow-blue-500/20"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
