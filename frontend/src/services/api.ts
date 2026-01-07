import axios, { AxiosInstance, AxiosError } from 'axios';

// Automatically detect backend DNS - use window.location.origin if not specified
const getBackendDNS = () => {
  const configuredDNS = import.meta.env.VITE_BACKEND_DNS || import.meta.env.VITE_API_BASE_URL;

  // If no DNS configured or empty string, use current origin (universal deployment)
  if (!configuredDNS || configuredDNS === '') {
    return window.location.origin;
  }

  return configuredDNS;
};

const BACKEND_DNS = getBackendDNS();
const BACKEND_CONTEXT = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
const BASE_PATH = `${BACKEND_DNS}${BACKEND_CONTEXT}`;

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_PATH,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        // Don't redirect on 401 - let the auth context handle it
        // The token refresh will handle expired tokens
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  // Auth endpoints
  async getAuthConfig() {
    const response = await this.client.get('/api/auth/config');
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/api/auth/user');
    return response.data;
  }

  // Service endpoints
  async getServices() {
    const response = await this.client.get('/api/services');
    return response.data;
  }

  async getServicesStatus() {
    const response = await this.client.get('/api/services/status');
    return response.data;
  }

  async getService(name: string) {
    const response = await this.client.get(`/api/services/${name}`);
    return response.data;
  }

  async getServiceHistory(name: string, limit?: number) {
    const params = limit ? { limit } : {};
    const response = await this.client.get(`/api/services/${name}/history`, { params });
    return response.data;
  }

  async checkService(name: string) {
    const response = await this.client.post(`/api/services/${name}/check`);
    return response.data;
  }

  async customCheck(
    service: string,
    endpoint: string,
    method?: string,
    headers?: Record<string, string>,
    body?: any
  ) {
    const response = await this.client.post('/api/services/custom-check', {
      service,
      endpoint,
      method,
      headers,
      body,
    });
    return response.data;
  }

  // Service CRUD operations (admin only)
  async createService(name: string, endpoint: string) {
    const response = await this.client.post('/api/services', {
      name,
      endpoint,
    });
    return response.data;
  }

  async updateService(name: string, endpoint: string) {
    const response = await this.client.put(`/api/services/${name}`, {
      endpoint,
    });
    return response.data;
  }

  async deleteService(name: string) {
    const response = await this.client.delete(`/api/services/${name}`);
    return response.data;
  }

  // Health endpoint
  async getHealth() {
    const response = await this.client.get('/api/health');
    return response.data;
  }

  // Status Page (Admin)
  async getStatusPageConfig() {
    const response = await this.client.get('/api/services/status-page/config');
    return response.data;
  }

  async updateStatusPageConfig(config: {
    slug: string | null;
    title: string;
    refreshInterval: number;
  }) {
    const response = await this.client.put('/api/services/status-page/config', config);
    return response.data;
  }

  // Public Status Page
  async getPublicStatus(slug: string) {
    const response = await this.client.get(`/api/public/status-page/${slug}`);
    return response.data;
  }
}

export const apiClient = new ApiClient();
