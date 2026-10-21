import net from 'node:net';
import { URL } from 'node:url';

/**
 * Normalizes legacy ICMP monitor endpoints into one safe ping argument.
 * URLs, host:port values, DNS names, and IPv4/IPv6 literals stay supported.
 */
export const endpointToIcmpHost = (endpoint: string): string | null => {
  try {
    const value = endpoint.trim();
    if (!value) return null;

    let host = value;
    if (value.includes('://')) {
      host = new URL(value).hostname;
    } else if (value.startsWith('[')) {
      const match = value.match(/^\[([^\]]+)\](?::\d+)?$/);
      if (!match) return null;
      host = match[1];
    } else if (value.includes(':') && net.isIP(value) !== 6) {
      const colonCount = (value.match(/:/g) || []).length;
      if (colonCount !== 1) return null;
      const [candidate, port] = value.split(':');
      if (!candidate || !/^\d{1,5}$/.test(port)) return null;
      host = candidate;
    }

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
