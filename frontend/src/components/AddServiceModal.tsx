import React, { useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../services/api';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddServiceModal({ isOpen, onClose, onSuccess }: AddServiceModalProps) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Validate inputs
      if (!name.trim() || !endpoint.trim()) {
        setError('Name and endpoint are required');
        return;
      }

      // Validate URL (extract base URL before |)
      try {
        const baseUrl = endpoint.includes('|') ? endpoint.split('|')[0] : endpoint;
        new URL(baseUrl);
      } catch {
        setError('Invalid endpoint URL');
        return;
      }

      await apiClient.createService(name.trim(), endpoint.trim());

      // Reset form and close
      setName('');
      setEndpoint('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setEndpoint('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-bg-surface rounded-xl border border-gray-800 shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">Add New Service</h2>
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., backend-api"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            />
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
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/health|Header1:Value1|Header2:Value2"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-400">
              URL with optional headers: endpoint|Header1:Value1|Header2:Value2
            </p>
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
              {isSubmitting ? 'Adding...' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
