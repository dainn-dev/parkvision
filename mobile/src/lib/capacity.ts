import { CapacityStatus } from '../types';

export function getCapacityStatus(available: number, total: number): CapacityStatus {
  if (total <= 0 || available <= 0) return 'FULL';
  const ratio = available / total;
  if (ratio > 0.3) return 'AVAILABLE';
  if (ratio >= 0.1) return 'LIMITED';
  return 'ALMOST_FULL';
}
