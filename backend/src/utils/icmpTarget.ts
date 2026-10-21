import net from 'node:net';
import { URL } from 'node:url';

const endpointHost = (value: string): string | null => {
  if (value.includes('://')) return new URL(value).hostname;
  if (value.startsWith('[')) return value.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] ?? null;
  if (!value.includes(':') || net.isIP(value) === 6) return value;
  const [candidate, port, extra] = value.split(':');
  if (!candidate || extra !== undefined || !/^\d{1,5}$/.test(port)) return null;
  return candidate;
};

/**
 * Normalizes legacy ICMP monitor endpoints into one safe ping argument.
 * URLs, host:port values, DNS names, and IPv4/IPv6 literals stay supported.
 */
export const endpointToIcmpHost = (endpoint: string): string | null => {
  try {
    const value = endpoint.trim();
    if (!value) return null;

    let host = endpointHost(value);
    if (!host) return null;

    if (host.startsWith('[')) host = host.slice(1);
    if (host.endsWith(']')) host = host.slice(0, -1);
    if (net.isIP(host)) return host;
    return host.length <= 253
      && /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(host)
      ? host
      : null;
  } catch {
    return null;
  }
};
