import { Clock, Edit2, Trash2 } from 'lucide-react';
import { ServiceStatus } from '../types';

interface ServiceCardProps {
  service: ServiceStatus;
  onClick: () => void;
  onEdit?: (service: ServiceStatus) => void;
  onDelete?: (service: ServiceStatus) => void;
  isAdmin?: boolean;
}

export default function ServiceCard({
  service,
  onClick,
  onEdit,
  onDelete,
  isAdmin,
}: ServiceCardProps) {
  const statusConfig = {
    healthy: { color: 'bg-green-500', label: 'Healthy' },
    unhealthy: { color: 'bg-red-500', label: 'Unhealthy' },
    unknown: { color: 'bg-yellow-500', label: 'Unknown' },
  }[service.currentStatus] || { color: 'bg-yellow-500', label: 'Unknown' };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(service);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(service);
  };

  return (
    <div
      onClick={onClick}
      className="relative p-4 rounded-lg border border-gray-700 bg-bg-surface cursor-pointer transition-all duration-200 hover:border-primary hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02]"
    >
      {/* Status Indicator Dot */}
      <div className="absolute top-3 right-3">
        <div className="relative">
          <div className={`w-2.5 h-2.5 rounded-full ${statusConfig.color}`}></div>
          <div
            className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${statusConfig.color} animate-ping opacity-75`}
          ></div>
        </div>
      </div>

      {/* Service Name and Endpoint */}
      <div className="pr-6 mb-3">
        <h3 className="text-base font-semibold text-text mb-1 truncate">{service.name}</h3>
        <div className="flex items-center gap-2">
          <p className="text-xs text-text-dim truncate flex-1">{service.endpoint}</p>
          {(() => {
            if (!service.headers) return null;
            let headerCount = 0;
            if (typeof service.headers === 'string') {
                try {
                    const parsed = JSON.parse(service.headers);
                    headerCount = Object.keys(parsed).length;
                } catch { headerCount = 0; }
            } else {
                headerCount = Object.keys(service.headers).length;
            }
            
            if (headerCount > 0) {
                return <span className="text-xs text-blue-400 flex-shrink-0">- Headers</span>;
            }
            return null;
          })()}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-3 mb-3 py-3 border-t border-gray-700">
        <div>
          <div className="text-xs text-text-dim mb-0.5">Status</div>
          <div className="text-sm font-medium text-text truncate">{statusConfig.label}</div>
        </div>

        <div>
          <div className="text-xs text-text-dim mb-0.5">Response Time</div>
          <div className="text-sm font-mono text-text">
            {service.lastCheck?.responseTime ? `${service.lastCheck.responseTime}ms` : '-'}
          </div>
        </div>

        <div>
          <div className="text-xs text-text-dim mb-0.5">Uptime</div>
          <div className="text-sm font-mono text-text">
            {service.uptime !== undefined ? `${service.uptime.toFixed(1)}%` : '-'}
          </div>
        </div>
      </div>

      {/* Last Check Time & SSL */ }
      <div className="flex items-center justify-between text-xs text-text-dim mb-3 pb-3 border-b border-gray-700">
        <div className="flex items-center gap-1.5">
             <Clock className="w-3 h-3" />
             <span className="truncate">
                 {service.lastCheck?.timestamp ? new Date(service.lastCheck.timestamp).toLocaleString() : '-'}
             </span>
        </div>

        {/* SSL Badge */}
        {(service.sslExpiry || service.ignoreSSL) && (
            <div className="flex items-center gap-2">
                {service.ignoreSSL && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-medium whitespace-nowrap">
                        Ignored
                    </span>
                )}
                {service.sslExpiry && (() => {
                    const days = Math.ceil((new Date(service.sslExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    let colorClass = 'bg-primary/10 text-primary border-primary/20'; // Default Blue/Green ish
                    if (days < 0) colorClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                    else if (days < 7) colorClass = 'bg-red-500/10 text-red-500 border-red-500/20';
                    else if (days < 30) colorClass = 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
                    else colorClass = 'bg-green-500/10 text-green-500 border-green-500/20';

                    return (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border font-medium whitespace-nowrap ${colorClass}`}>
                            SSL: {days < 0 ? 'Exp' : `${days}d`}
                        </span>
                    );
                })()}
            </div>
        )}
      </div>

      {/* Admin Actions */}
      {isAdmin && (onEdit || onDelete) && (
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={handleEdit}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-800 hover:bg-blue-500 text-white rounded transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
