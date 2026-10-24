export function serviceStatusPresentation(status: string) {
  if (status === 'healthy') return { label: 'Healthy', color: 'success' };
  if (status === 'unhealthy') return { label: 'Unhealthy', color: 'error' };
  return { label: 'Unknown', color: 'warning' };
}

export function statColorClass(color?: string) {
  if (color === 'success') return 'text-success';
  if (color === 'error') return 'text-error';
  if (color === 'warning') return 'text-warning';
  return 'text-primary';
}
