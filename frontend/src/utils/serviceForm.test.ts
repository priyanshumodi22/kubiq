import { describe, expect, it } from 'vitest';
import { isHttpEndpoint, serviceEndpointLabel, serviceEndpointPlaceholder } from './serviceForm';

describe('service form compatibility', () => {
  it('names host monitors without database terminology', () => {
    expect(serviceEndpointLabel('http')).toBe('Endpoint URL');
    expect(serviceEndpointLabel('icmp')).toBe('Hostname or IP address');
    expect(serviceEndpointLabel('mysql')).toBe('Connection String');
    expect(serviceEndpointLabel('mongodb')).toBe('Connection String');
  });
  it('validates the URL before optional pipe-separated headers', () => {
    expect(isHttpEndpoint('https://example.test/health|Authorization:fixture')).toBe(true);
    expect(isHttpEndpoint('http://localhost:3000/health')).toBe(true);
    expect(isHttpEndpoint('not a URL|Header:value')).toBe(false);
    expect(isHttpEndpoint('')).toBe(false);
    // Existing validation accepts URL schemes; backend monitor validation remains authoritative.
    expect(isHttpEndpoint('ftp://example.test')).toBe(true);
  });

  it('uses monitor-specific placeholders', () => {
    expect(serviceEndpointPlaceholder('http')).toBe('https://api.example.com/health');
    expect(serviceEndpointPlaceholder('mysql')).toBe('mysql://user:pass@host:3306');
    expect(serviceEndpointPlaceholder('mongodb')).toBe('mongodb://user:pass@host:27017');
    expect(serviceEndpointPlaceholder('icmp')).toBe('e.g. example.com or 192.168.1.100');
    expect(serviceEndpointPlaceholder('icmp', true)).toBe('e.g. example.com or 192.168.1.100');
    expect(serviceEndpointPlaceholder('http', true)).toBe('https://...');
    expect(serviceEndpointPlaceholder('mysql', true)).toBe('mysql://...');
    expect(serviceEndpointPlaceholder('mongodb', true)).toBe('mongodb://...');
  });
});
