import { useState } from 'react';
import { manualClose, manualLock, manualOpen, manualPlate, manualUnlock, type GateStatus } from '../../lib/tauri';

interface Props { gate: GateStatus; onAction: (fn: () => Promise<unknown>, ok: string) => void; }
export default function QuickActions({ gate, onAction }: Props) {
  const [plate, setPlate] = useState('');
  const blocked = gate.gateState === 'locked' || gate.gateState === 'fault';
  const submit = () => { const value = plate.trim().toUpperCase(); if (!value) return; setPlate(''); onAction(() => manualPlate(value, gate.gateId), `Đã gửi biển ${value}`); };
  return <div className="flex flex-wrap gap-2"><button type="button" disabled={blocked} aria-label="Mở barrier" onClick={() => onAction(() => manualOpen(gate.gateId), 'Mở barrier')} className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-bold disabled:opacity-40">MỞ</button><button type="button" disabled={blocked} aria-label="Đóng barrier" onClick={() => onAction(() => manualClose(gate.gateId), 'Đóng barrier')} className="min-h-11 rounded-lg bg-zinc-700 px-4 text-sm font-semibold disabled:opacity-40">ĐÓNG</button><input aria-label="Nhập biển số" value={plate} onChange={(e) => setPlate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Biển số" className="min-h-11 w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm" /><button type="button" aria-label={gate.gateState === 'locked' ? 'Mở khóa barrier' : 'Khóa barrier'} onClick={() => onAction(gate.gateState === 'locked' ? () => manualUnlock(gate.gateId) : () => manualLock(gate.gateId), gate.gateState === 'locked' ? 'Đã mở khóa' : 'Đã khóa')} className="min-h-11 rounded-lg border border-orange-700/50 px-4 text-sm text-orange-300">{gate.gateState === 'locked' ? 'MỞ KHÓA' : 'KHÓA'}</button></div>;
}
