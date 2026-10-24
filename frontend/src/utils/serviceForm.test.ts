import { describe, expect, it } from 'vitest';
import { isHttpEndpoint, serviceEndpointPlaceholder } from './serviceForm';

describe('service form compatibility', () => {
  it('validates the URL before optional pipe-separated headers', () => {
    expect(isHttpEndpoint('https://example.test/health|Authorization:fixture')).toBe(true);
    expect(isHttpEndpoint('http://localhost:3000/health')).toBe(true);
    expect(isHttpEndpoint('not a URL|Header:value')).toBe(false);
    expect(isHttpEndpoint('')).toBe(false);
    // Existing validation accepts URL schemes; backend monitor validation remains authoritative.
    expect(isHttpEndpoint('ftp://example.test')).toBe(true);
  });

  it('preserves placeholders including the existing fallback for non-HTTP types', () => {
    expect(serviceEndpointPlaceholder('http')).toBe('https://api.example.com/health');
    expect(serviceEndpointPlaceholder('mysql')).toBe('mysql://user:pass@host:3306');
    expect(serviceEndpointPlaceholder('mongodb')).toBe('mongodb://user:pass@host:27017');
    expect(serviceEndpointPlaceholder('icmp')).toBe('mongodb://user:pass@host:27017');
    expect(serviceEndpointPlaceholder('http', true)).toBe('https://...');
    expect(serviceEndpointPlaceholder('mysql', true)).toBe('mysql://...');
    expect(serviceEndpointPlaceholder('mongodb', true)).toBe('mongodb://...');
  });
});
