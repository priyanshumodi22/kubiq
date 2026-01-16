import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  TrendingUp,
  Clock,
  Activity,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react';
import { ServiceStatus } from '../types';
import { useServiceHistory } from '../hooks/useServices';
import { apiClient } from '../services/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Combobox from './Combobox';

const COMMON_HEADERS = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Date',
  'Host',
  'If-Modified-Since',
  'If-None-Match',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'X-Forwarded-For',
  'X-Forwarded-Proto',
];

const COMMON_HEADER_VALUES: Record<string, string[]> = {
  Accept: ['application/json', 'application/xml', 'text/html', 'text/plain', '*/*'],
  'Accept-Encoding': ['gzip', 'deflate', 'br', 'identity'],
  Authorization: ['Bearer ', 'Basic '],
  'Cache-Control': ['no-cache', 'no-store', 'max-age=0', 'no-transform'],
  Connection: ['keep-alive', 'close'],
  'Content-Type': [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    'application/xml',
    'application/javascript',
  ],
  'User-Agent': ['Mozilla/5.0', 'PostmanRuntime/7.26.8'],
};

interface ServiceDetailProps {
  service: ServiceStatus;
  onClose: () => void;
}

export default function ServiceDetail({ service, onClose }: ServiceDetailProps) {
  const { history, loading, refresh } = useServiceHistory(service.name, 50);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customResult, setCustomResult] = useState<any>(null);
  const [checkingCustom, setCheckingCustom] = useState(false);
  const [manualChecking, setManualChecking] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);

  // Custom check detailed state
  const [method, setMethod] = useState('GET');
  const [requestHeaders, setRequestHeaders] = useState<{ key: string; value: string }[]>([]);
  const [requestBody, setRequestBody] = useState('');
  const [showRequestOptions, setShowRequestOptions] = useState(false);

  const methods = ['GET', 'POST', 'PUT'];

  const addHeader = () => {
    setRequestHeaders([...requestHeaders, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    const newHeaders = [...requestHeaders];
    newHeaders.splice(index, 1);
    setRequestHeaders(newHeaders);
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...requestHeaders];
    newHeaders[index][field] = value;
    setRequestHeaders(newHeaders);
  };

  const chartData = history.map((check) => ({
    time: new Date(check.timestamp).toLocaleTimeString(),
    responseTime: check.responseTime,
    success: check.success,
  }));

  const handleManualCheck = async () => {
    setManualChecking(true);
    try {
      await apiClient.checkService(service.name);
      setTimeout(refresh, 500); // Refresh after check
    } catch (error) {
      console.error('Manual check failed:', error);
    } finally {
      setManualChecking(false);
    }
  };

  const handleCustomCheck = async () => {
    if (!customEndpoint.trim()) return;

    setCheckingCustom(true);
    setCustomResult(null);

    try {
      let bodyData = undefined;
      if (requestBody.trim()) {
        try {
          bodyData = JSON.parse(requestBody);
        } catch (e) {
          setCustomResult({
            status: 'error',
            message: 'Invalid JSON in request body',
          });
          setCheckingCustom(false);
          return;
        }
      }

      const headersMap: Record<string, string> = {};
      requestHeaders.forEach((h) => {
        if (h.key.trim()) {
          headersMap[h.key.trim()] = h.value;
        }
      });

      const result = await apiClient.customCheck(
        service.name,
        customEndpoint,
        method,
        headersMap,
        bodyData
      );
      setCustomResult(result);
    } catch (error: any) {
      setCustomResult({
        status: 'error',
        message: error.message,
      });
    } finally {
      setCheckingCustom(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-bg-surface rounded-xl border border-gray-800 max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto scrollbar-hide scale-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-bg-surface border-b border-gray-800 p-4 sm:p-6 flex items-start justify-between z-10 gap-2 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-bold text-text truncate">{service.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs sm:text-sm text-text-dim truncate flex-1">{service.endpoint}</p>
              {service.headers && Object.keys(service.headers).length > 0 && (
                <button
                  onClick={() => setShowHeaders(!showHeaders)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 flex-shrink-0"
                >
                  {showHeaders ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  Headers
                </button>
              )}
            </div>
            {showHeaders && service.headers && (
              <div className="mt-2 p-2 bg-gray-800 rounded text-xs space-y-1">
                {Object.entries(service.headers).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-blue-400 font-mono">{key}:</span>
                    <span className="text-gray-300 font-mono">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-bg-elevated rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              icon={Activity}
              label="Status"
              value={service.currentStatus}
              color={service.currentStatus === 'healthy' ? 'success' : 'error'}
            />
            <StatCard
              icon={Clock}
              label="Response Time"
              value={`${service.lastCheck?.responseTime || 0}ms`}
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Response"
              value={`${Math.round(service.averageResponseTime || 0)}ms`}
            />
            <StatCard
              icon={Activity}
              label="Uptime"
              value={`${(service.uptime || 0).toFixed(1)}%`}
              color={service.uptime && service.uptime > 95 ? 'success' : 'warning'}
            />
          </div>

          {/* Manual Check Button */}
          <button
            onClick={handleManualCheck}
            disabled={manualChecking}
            className="w-full py-2.5 sm:py-3 text-sm sm:text-base bg-primary hover:bg-primary/80 disabled:bg-primary/50 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">
              {manualChecking ? 'Checking...' : 'Run Manual Health Check'}
            </span>
            <span className="xs:hidden">{manualChecking ? 'Checking...' : 'Run Check'}</span>
          </button>

          {/* Response Time Chart */}
          {!loading && history.length > 0 && (
            <div className="bg-bg-elevated rounded-lg p-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                Response Time History
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" stroke="#888" fontSize={12} />
                  <YAxis
                    stroke="#888"
                    fontSize={12}
                    label={{
                      value: 'Resp. Time (ms)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#888', fontSize: 12, textAnchor: 'middle' },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="responseTime"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Custom Endpoint Check */}
          <div className="bg-bg-elevated rounded-lg p-3 sm:p-4">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
              Custom Endpoint Check
            </h3>
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative w-full sm:w-24 flex-shrink-0">
                   <div className="relative">
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-sm sm:text-base font-medium bg-bg rounded-lg border border-gray-700 focus:border-primary focus:outline-none appearance-none cursor-pointer hover:bg-bg-elevated transition-colors"
                    >
                      {methods.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                   </div>
                </div>
                <input
                  type="text"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="/custom-endpoint"
                  className="flex-1 px-3 sm:px-4 py-2 text-sm sm:text-base bg-bg rounded-lg border border-gray-700 focus:border-primary focus:outline-none"
                />
                <button
                  onClick={handleCustomCheck}
                  disabled={checkingCustom || !customEndpoint.trim()}
                  className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-primary hover:bg-primary/80 disabled:bg-primary/50 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {checkingCustom ? 'Checking...' : 'Check'}
                </button>
              </div>

              <button
                onClick={() => setShowRequestOptions(!showRequestOptions)}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 self-start"
              >
                {showRequestOptions ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                Advanced Options (Headers & Body)
              </button>

              {showRequestOptions && (
                <div className="space-y-4 p-3 bg-bg rounded-lg border border-gray-800">
                  {/* Headers Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-dim">Request Headers</span>
                      <button
                        onClick={addHeader}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Header
                      </button>
                    </div>

                    {requestHeaders.length === 0 && (
                      <div className="text-xs text-text-dim italic">No custom headers</div>
                    )}

                    <div className="space-y-2">
                      {requestHeaders.map((header, idx) => (
                        <div key={idx} className="flex gap-2">
                          <Combobox
                            value={header.key}
                            onChange={(val) => updateHeader(idx, 'key', val)}
                            options={COMMON_HEADERS}
                            placeholder="Key"
                            className="flex-1 min-w-0"
                          />
                          <Combobox
                            value={header.value}
                            onChange={(val) => updateHeader(idx, 'value', val)}
                            options={COMMON_HEADER_VALUES[header.key] || []}
                            placeholder="Value"
                            className="flex-1 min-w-0"
                          />
                          <button
                            onClick={() => removeHeader(idx)}
                            className="p-1.5 text-error hover:bg-error/10 rounded self-start mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Body Section */}
                  {method !== 'GET' && method !== 'HEAD' && (
                    <div>
                      <span className="text-xs font-semibold text-text-dim mb-2 block">
                        Request Body (JSON)
                      </span>
                      <textarea
                        value={requestBody}
                        onChange={(e) => setRequestBody(e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full h-32 px-3 py-2 text-xs font-mono bg-bg-surface rounded border border-gray-700 focus:border-primary focus:outline-none resize-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {customResult && (
              <div className="mt-4 p-4 bg-bg rounded-lg border border-gray-700 font-mono text-sm overflow-x-auto">
                <pre className="text-text-dim">{JSON.stringify(customResult, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Recent Checks */}
          {!loading && history.length > 0 && (
            <div className="bg-bg-elevated rounded-lg p-3 sm:p-4">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Recent Checks</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                {history
                  .slice(-10)
                  .reverse()
                  .map((check, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 p-2.5 sm:p-3 bg-bg rounded-lg text-xs sm:text-sm"
                    >
                      <span className="text-text-dim truncate">
                        {new Date(check.timestamp).toLocaleString()}
                      </span>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <span className="font-mono text-text">{check.responseTime}ms</span>
                        <span
                          className={`px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                            check.success ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                          }`}
                        >
                          {check.status}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function StatCard({ icon: Icon, label, value, color }: any) {
  const colorClass =
    color === 'success'
      ? 'text-success'
      : color === 'error'
      ? 'text-error'
      : color === 'warning'
      ? 'text-warning'
      : 'text-primary';

  return (
    <div className="bg-bg-elevated rounded-lg p-3 sm:p-4">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${colorClass}`} />
        <span className="text-xs text-text-dim truncate">{label}</span>
      </div>
      <div className={`text-lg sm:text-xl font-bold ${colorClass} truncate`}>{value}</div>
    </div>
  );
}
