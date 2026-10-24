type MonitorType = import('../types').ServiceConfig['type'];

export function serviceEndpointPlaceholder(type: MonitorType, editing = false): string {
  if (type === 'http') return editing ? 'https://...' : 'https://api.example.com/health';
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
