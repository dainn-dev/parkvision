import { useState } from 'react';
import type { EdgeConfig, GateBinding } from '../../lib/tauri';
import BarrierSettingsScreen from '../../screens/BarrierSettingsScreen';
import CameraSettings from './CameraSettings';
import DeviceSettings from './DeviceSettings';

type Props = {
  cfg: EdgeConfig;
  gate: GateBinding;
  mqttConnected: boolean;
  lastSyncAt: string | null;
  onSaved: (cfg: EdgeConfig) => void;
  onClose: () => void;
  onResync: () => void;
  onLock: () => void;
  notify: (message: string) => void;
};

type Section = 'device' | 'camera' | 'barrier';

export default function SettingsModal({ cfg, gate, mqttConnected, lastSyncAt, onSaved, onClose, onResync, onLock, notify }: Props) {
  const [section, setSection] = useState<Section>('device');


  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="font-bold">Cài đặt Edge Client</h2>
          <button type="button" aria-label="Đóng cài đặt" title="Đóng" onClick={onClose} className="min-h-11 min-w-11 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">✕</button>
        </div>
        <nav aria-label="Nhóm cài đặt" className="flex gap-2 border-b border-zinc-800 px-5 py-3">
          {([['device', 'Thiết bị'], ['camera', 'Camera'], ['barrier', 'Barrier']] as const).map(([value, label]) => (
            <button type="button" key={value} onClick={() => setSection(value)} className={`min-h-11 rounded-md px-3 text-sm ${section === value ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {section === 'device' && <DeviceSettings mqttConnected={mqttConnected} lastSyncAt={lastSyncAt} onResync={onResync} onLock={onLock} notify={notify} />}
          {section === 'camera' && <CameraSettings cameras={gate.cameras} />}
          {section === 'barrier' && <BarrierSettingsScreen embedded cfg={cfg} gate={gate} onSaved={onSaved} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
