import { CONFIG } from './config.js';
import { log } from './logger.js';
import type { SlicePlan } from './types.js';

export function buildSlicePlan(totalSize: number): SlicePlan {
  const minSlice = CONFIG.sliceMinSize;
  const requestedSlices = CONFIG.sliceCount;

  if (totalSize <= 0) {
    return { sizes: [], intervalMs: 0, totalSize: 0 };
  }

  if (totalSize <= minSlice) {
    return { sizes: [totalSize], intervalMs: 0, totalSize };
  }

  const maxSlices = Math.floor(totalSize / minSlice);
  const sliceCount = Math.max(1, Math.min(requestedSlices, maxSlices));
  const intervalMs = Math.floor(CONFIG.sliceDurationMs / sliceCount);

  const sizes: number[] = [];
  let remaining = totalSize;

  for (let i = 0; i < sliceCount - 1; i++) {
    const slice = Math.max(minSlice, Math.round((totalSize / sliceCount) * 100) / 100);
    sizes.push(slice);
    remaining = Math.round((remaining - slice) * 100) / 100;
  }

  sizes.push(Math.max(minSlice, remaining));

  return { sizes, intervalMs, totalSize };
}

export function formatSlicePlan(plan: SlicePlan): string {
  if (plan.sizes.length <= 1) {
    return `single order (${plan.totalSize.toFixed(2)} shares)`;
  }
  const durationSec = ((plan.sizes.length - 1) * plan.intervalMs) / 1000;
  return `${plan.sizes.length} slices over ${durationSec.toFixed(0)}s (${plan.intervalMs}ms interval)`;
}

export function logSlicePlan(label: string, plan: SlicePlan): void {
  log(`Slice ${label}: ${formatSlicePlan(plan)} | sizes=[${plan.sizes.map((s) => s.toFixed(2)).join(', ')}]`);
}
