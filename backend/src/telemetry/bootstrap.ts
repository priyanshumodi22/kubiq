import { startTracing } from 'kubiq-apm/runtime';
// Preloaded separately from the ncc bundle; application shutdown owns this provider.
export const tracing = startTracing({ profile: 'kubiq', serviceName: 'kubiq-backend' });
