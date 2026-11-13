import type { CameraBinding } from '../../lib/tauri';

export interface CamLiveInfo { jpeg?: string; state?: string; detail?: string; }
const purposeLabel: Record<string, string> = { plate: 'CAM BIỂN SỐ', overview: 'CAM TOÀN CẢNH' };
const stateLabel: Record<string, string> = { live: 'TRỰC TIẾP', ready: 'SẴN SÀNG', connected: 'ĐÃ KẾT NỐI', error: 'LỖI STREAM', worker_error: 'LỖI WORKER' };
interface Props { camera: CameraBinding; live?: CamLiveInfo; className?: string; }

export default function CameraTile({ camera, live, className = '' }: Props) {
  const purpose = purposeLabel[camera.purpose] ?? camera.purpose.toUpperCase();
  const state = stateLabel[live?.state ?? ''] ?? live?.state?.toUpperCase() ?? 'CHƯA CÓ TÍN HIỆU';
  const alt = `${purpose} — ${state}`;
  return (
    <div className={`relative flex min-h-32 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 ${className}`}>
      {live?.jpeg && <img src={`data:image/jpeg;base64,${live.jpeg}`} alt={alt} className="absolute inset-0 h-full w-full object-cover" />}
      <div className="relative z-10 flex items-start justify-between p-2.5">
        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">{purpose}</span>
        <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">{state}</span>
      </div>
      {!live?.jpeg && <span className="relative z-10 flex flex-1 items-center justify-center text-center text-xs text-zinc-500">{live?.detail ?? 'Chưa có tín hiệu'}</span>}
    </div>
  );
}
