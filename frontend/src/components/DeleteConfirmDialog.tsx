import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { apiClient } from '../services/api';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <h2 className="text-xl font-bold text-white">Delete Service</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded">
              {error}
            </div>
          )}

          <p className="text-gray-300">
            Are you sure you want to delete the service{' '}
            <span className="font-bold text-white">"{serviceName}"</span>?
          </p>

          <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-500 px-4 py-3 rounded">
            <p className="text-sm">
              ⚠️ This action cannot be undone. All monitoring history for this service will be lost.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Service'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
