import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { apiClient } from '../services/api';
import { createPortal } from 'react-dom';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceName: string;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onSuccess,
  serviceName,
}: DeleteConfirmDialogProps) {
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setError('');
    setIsDeleting(true);

    try {
      await apiClient.deleteService(serviceName);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete service');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden relative">
        
        {/* Subtle Gradient Glow at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500/20 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-red-500/20 to-transparent blur-3xl opacity-20" />

        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-6 text-red-500">
                <Trash2 className="w-5 h-5" />
            </div>
            
            <h3 className="text-xl font-bold text-white mb-2">Delete Service</h3>
            <div className="space-y-3 mb-8 text-center">
                <p className="text-gray-400 text-sm leading-relaxed">
                    Are you sure you want to delete <span className="text-white font-semibold">"{serviceName}"</span>? 
                </p>
                <div className="px-4 py-2 bg-red-500/5 rounded-lg border border-red-500/10">
                    <p className="text-[11px] text-red-400 font-medium uppercase tracking-wider">
                        ⚠️ Action cannot be undone
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs text-left animate-in slide-in-from-top-1">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
                disabled={isDeleting}
                >
                Cancel
                </button>
                <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
                disabled={isDeleting}
                >
                {isDeleting ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : 'Delete'}
                </button>
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
