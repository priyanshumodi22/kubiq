/** Copy before removing restricted fields; never mutate the monitor's stored service. */
export function withoutRawLogConfig<T extends { logPath?: unknown; logSources?: unknown }>(service: T): Omit<T, 'logPath' | 'logSources'> {
  const result = { ...service };
  delete result.logPath;
  delete result.logSources;
  return result;
}
