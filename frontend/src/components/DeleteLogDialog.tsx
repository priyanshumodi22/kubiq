import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { apiClient } from '../services/api';
import { ServiceStatus } from '../types';

interface DeleteLogDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  service: ServiceStatus;
}

export function DeleteLogDialog({
  isOpen,
  onClose,
  onSuccess,
  service,
}: DeleteLogDialogProps) {
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setError('');
    setIsDeleting(true);

    try {
      // Pass all original service details, but clear the logPath
      await apiClient.updateService(
        service.name,
        service.endpoint,
        service.type,
        service.ignoreSSL,
        '' // logPath cleared
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to remove log configuration');
    } finally {
      setIsDeleting(false);
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
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500/20 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-red-500/20 to-transparent blur-3xl opacity-20" />

        <div className="p-6 w-full flex flex-col items-center">
        {/* Icon Circle */}
        <div className="w-16 h-16 rounded-full bg-bg-surface flex items-center justify-center mb-6 border border-gray-800">
          <Trash2 className="w-8 h-8 text-red-500" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-2">Remove Log Source</h2>

        {/* Description */}
        <div className="space-y-4 mb-8">
          <p className="text-gray-400 text-sm leading-relaxed">
            Are you sure you want to remove the log configuration for <span className="font-semibold text-white">"{service.name}"</span>? 
            <br/>
            This action cannot be undone.
          </p>
          
          {error && (
            <div className="text-red-400 text-xs bg-red-500/10 p-2 rounded border border-red-500/20">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-3 px-4 bg-transparent border border-gray-700 hover:border-gray-600 text-white rounded-xl transition-all font-medium text-sm"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex-1 py-3 px-4 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-500 hover:text-red-400 rounded-xl transition-all font-medium text-sm"
            disabled={isDeleting}
          >
            {isDeleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
