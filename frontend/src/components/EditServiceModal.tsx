import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../services/api';

interface EditServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  serviceName: string;
  currentEndpoint: string;
}

export function EditServiceModal({
  isOpen,
  onClose,
  onSuccess,
  serviceName,
  currentEndpoint,
}: EditServiceModalProps) {
  const [endpoint, setEndpoint] = useState(currentEndpoint);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEndpoint(currentEndpoint);
  }, [currentEndpoint, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Validate input
      if (!endpoint.trim()) {
        setError('Endpoint is required');
        return;
      }

      // Validate URL
      try {
        new URL(endpoint);
      } catch {
        setError('Invalid endpoint URL');
        return;
      }

      await apiClient.updateService(serviceName, endpoint.trim());

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setEndpoint(currentEndpoint);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Edit Service</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="serviceName" className="block text-sm font-medium text-gray-300 mb-1">
              Service Name
            </label>
            <input
              id="serviceName"
              type="text"
              value={serviceName}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
              disabled
            />
            <p className="mt-1 text-xs text-gray-400">Service name cannot be changed</p>
          </div>

          <div>
            <label
              htmlFor="serviceEndpoint"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Endpoint URL
            </label>
            <input
              id="serviceEndpoint"
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/health"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-400">Full URL to the service health endpoint</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
