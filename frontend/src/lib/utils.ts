import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HazardLevel } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hazardColor(level: HazardLevel | string): string {
  switch (level) {
    case 'critical':
      return '#ff453a';
    case 'danger':
      return '#ff6961';
    case 'warning':
      return '#ffd60a';
    default:
      return '#30d158';
  }
}

export function ledColor(led: string): string {
  switch (led) {
    case 'pulsing_red':
    case 'red':
      return '#ff453a';
    case 'yellow':
      return '#ffd60a';
    default:
      return '#30d158';
  }
}

/** Distinct spatial type colors for twin / floor plan */
export function nodeTypeColor(type: string): string {
  switch (type) {
    case 'corridor':
      return '#8e8e93';
    case 'stairs':
      return '#bf5af2';
    case 'exit':
      return '#30d158';
    default:
      return '#5ac8fa';
  }
}

export function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

/** Clock time with milliseconds, e.g. 8:39:12.345 PM */
export function formatTimeMs(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  } catch {
    return iso;
  }
}

/** Delta from ambient for sensor adjustment display */
export function sensorDelta(value: number, ambient: number, unit = ''): string {
  const d = value - ambient;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(unit === '%' || unit === '' ? 0 : 1)}${unit}`;
}
