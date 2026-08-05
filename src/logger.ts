export function log(message: string, level: 'info' | 'warn' | 'error' | 'signal' = 'info'): void {
  const ts = new Date().toISOString();
  const prefix = {
    info: '[INFO]',
    warn: '[WARN]',
    error: '[ERROR]',
    signal: '[SIGNAL]',
  }[level];
  console.log(`${ts} ${prefix} ${message}`);
}

export function logSignal(strategy: string, message: string): void {
  log(`[${strategy}] ${message}`, 'signal');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
