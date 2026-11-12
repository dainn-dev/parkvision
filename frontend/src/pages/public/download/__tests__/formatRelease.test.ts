import { describe, expect, test } from 'vitest';
import { formatBytes, formatDate } from '../formatRelease';

describe('formatBytes', () => {
  test('formats megabytes with one decimal', () => {
    expect(formatBytes(48211456)).toBe('46.0 MB');
  });
  test('formats zero as bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
  test('formats kilobytes and gigabytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });
});

describe('formatDate', () => {
  test('formats an ISO date in UTC for the locale', () => {
    expect(formatDate('2026-11-10T08:00:00Z', 'en')).toBe('Nov 10, 2026');
  });
  test('returns the raw input for an invalid date string', () => {
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatDate('', 'en')).toBe('');
  });
});
