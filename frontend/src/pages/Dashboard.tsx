import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Search, Filter, Plus, ChevronDown } from 'lucide-react';
import { useServices } from '../hooks/useServices';
import { useAuth } from '../contexts/AuthContext';
import ServiceCard from '../components/ServiceCard';
import ServiceDetail from '../components/ServiceDetail';
import { AddServiceModal } from '../components/AddServiceModal';
import { EditServiceModal } from '../components/EditServiceModal';
import { DeleteConfirmDialog } from '../components/DeleteConfirmDialog';
import { ServiceStatus } from '../types';

export default function Dashboard() {
  const { services, stats, loading, error, refresh } = useServices();
  const { hasRole } = useAuth();
  const [selectedService, setSelectedService] = useState<ServiceStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'unhealthy' | 'unknown'>(
    'all'
  );
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editService, setEditService] = useState<ServiceStatus | null>(null);
  const [deleteService, setDeleteService] = useState<ServiceStatus | null>(null);

  const isAdmin = hasRole('kubiq-admin');

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setFilterDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.endpoint.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = statusFilter === 'all' || service.currentStatus === statusFilter;
    return matchesSearch && matchesFilter;
  });

  if (loading && services.length === 0) {
    return (
      <div className="relative min-h-screen">
        {/* Background Effects */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Gradient base */}
          <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
          {/* Radial gradient overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
          {/* Blur orbs */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
        </div>

        <div className="flex items-center justify-center min-h-[60vh] relative">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-text-dim">Loading services...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen">
        {/* Background Effects */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Gradient base */}
          <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
          {/* Radial gradient overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
          {/* Blur orbs */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
        </div>

        <div className="flex items-center justify-center min-h-[60vh] relative">
          <div className="text-center">
            <p className="text-error mb-2">Error loading services</p>
            <p className="text-text-dim text-sm">{error}</p>
            <button
              onClick={refresh}
              className="mt-4 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
        {/* Blur orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
      </div>

      <div className="space-y-6 relative">
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatsCard label="Total Services" value={stats.totalServices} color="text-primary" />
            <StatsCard label="Healthy" value={stats.healthyServices} color="text-success" />
            <StatsCard label="Unhealthy" value={stats.unhealthyServices} color="text-error" />
            <StatsCard label="Unknown" value={stats.unknownServices} color="text-warning" />
          </div>
        )}

        {/* Filters and Search */}
        <div className="bg-bg-surface rounded-lg p-3 sm:p-4 border border-gray-800">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-text-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search services..."
                className="w-full pl-9 sm:pl-10 pr-4 py-2 text-sm sm:text-base bg-bg-elevated rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2 relative" ref={filterDropdownRef}>
              <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-text-dim flex-shrink-0" />
              <button
                onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base bg-bg-elevated rounded-lg border border-gray-700 hover:border-primary focus:border-primary focus:outline-none transition-colors cursor-pointer"
              >
                <span className="whitespace-nowrap">
                  {statusFilter === 'all' && 'All Status'}
                  {statusFilter === 'healthy' && 'Healthy'}
                  {statusFilter === 'unhealthy' && 'Unhealthy'}
                  {statusFilter === 'unknown' && 'Unknown'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-text-dim transition-transform ${
                    filterDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {filterDropdownOpen && (
                <div className="absolute top-full mt-2 right-0 w-40 bg-bg-surface border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setFilterDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-bg-elevated transition-colors ${
                      statusFilter === 'all' ? 'bg-primary/10 text-primary' : 'text-text'
                    }`}
                  >
                    All Status
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter('healthy');
                      setFilterDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-bg-elevated transition-colors ${
                      statusFilter === 'healthy' ? 'bg-primary/10 text-primary' : 'text-text'
                    }`}
                  >
                    Healthy
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter('unhealthy');
                      setFilterDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-bg-elevated transition-colors ${
                      statusFilter === 'unhealthy' ? 'bg-primary/10 text-primary' : 'text-text'
                    }`}
                  >
                    Unhealthy
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter('unknown');
                      setFilterDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-bg-elevated transition-colors ${
                      statusFilter === 'unknown' ? 'bg-primary/10 text-primary' : 'text-text'
                    }`}
                  >
                    Unknown
                  </button>
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-800 hover:bg-blue-500 disabled:bg-blue-600 rounded-lg transition-colors whitespace-nowrap h-[42px]"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* Add Service (Admin Only) */}
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors whitespace-nowrap h-[42px]"
              >
                <Plus className="w-5 h-5" />
                Add Service
              </button>
            )}
          </div>
        </div>

        {/* Services Grid */}
        {filteredServices.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm sm:text-base text-text-dim">No services found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredServices.map((service) => (
              <ServiceCard
                key={service.name}
                service={service}
                onClick={() => setSelectedService(service)}
                isAdmin={isAdmin}
                onEdit={(svc) => setEditService(svc)}
                onDelete={(svc) => setDeleteService(svc)}
              />
            ))}
          </div>
        )}

        {/* Service Detail Modal */}
        {selectedService && (
          <ServiceDetail service={selectedService} onClose={() => setSelectedService(null)} />
        )}

        {/* Add Service Modal (Admin Only) */}
        {isAdmin && (
          <AddServiceModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              refresh();
            }}
          />
        )}

        {/* Edit Service Modal (Admin Only) */}
        {isAdmin && editService && (
          <EditServiceModal
            isOpen={!!editService}
            onClose={() => setEditService(null)}
            onSuccess={() => {
              refresh();
            }}
            serviceName={editService.name}
            currentEndpoint={editService.endpoint}
            currentHeaders={editService.headers}
          />
        )}

        {/* Delete Confirm Dialog (Admin Only) */}
        {isAdmin && deleteService && (
          <DeleteConfirmDialog
            isOpen={!!deleteService}
            onClose={() => setDeleteService(null)}
            onSuccess={() => {
              refresh();
            }}
            serviceName={deleteService.name}
          />
        )}
      </div>
    </div>
  );
}

function StatsCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-surface rounded-lg p-3 sm:p-4 border border-gray-800">
      <p className="text-xs sm:text-sm text-text-dim mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
