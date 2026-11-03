type MonitorType = import('../types').ServiceConfig['type'];

export function serviceEndpointLabel(type: MonitorType): string {
  if (type === 'http') return 'Endpoint URL';
  if (type === 'icmp') return 'Hostname or IP address';
  return 'Connection String';
}

export function serviceEndpointPlaceholder(type: MonitorType, editing = false): string {
  if (type === 'http') return editing ? 'https://...' : 'https://api.example.com/health';
  if (type === 'icmp') return 'e.g. example.com or 192.168.1.100';
  if (type === 'mysql') return editing ? 'mysql://...' : 'mysql://user:pass@host:3306';
  return editing ? 'mongodb://...' : 'mongodb://user:pass@host:27017';
}

export function isHttpEndpoint(endpoint: string): boolean {
  try {
    const baseUrl = endpoint.includes('|') ? endpoint.split('|')[0] : endpoint;
    new URL(baseUrl);
    return true;
  } catch {
    return false;
  }
}
