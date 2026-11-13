import type { CameraBinding } from '../../lib/tauri';
import CameraTile, { type CamLiveInfo } from './CameraTile';

interface Props { cameras: CameraBinding[]; camLive: Record<string, CamLiveInfo>; selectedCameraId?: string; onSelectCamera?: (cameraId: string) => void; }

export default function CameraWorkspace({ cameras, camLive, selectedCameraId, onSelectCamera }: Props) {
  if (!cameras.length) return <div className="flex min-h-44 items-center justify-center rounded-xl border border-zinc-800 text-zinc-500">Chưa gán camera</div>;
  const selected = cameras.find((camera) => camera.cameraId === selectedCameraId) ?? cameras[0];
  const many = cameras.length > 4;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className={`grid min-h-0 flex-1 gap-2 ${many ? 'grid-cols-1' : cameras.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        <CameraTile camera={many ? selected : cameras[0]} live={camLive[(many ? selected : cameras[0]).cameraId]} className="min-h-0" />
        {!many && cameras.slice(1).map((camera) => <CameraTile key={camera.cameraId} camera={camera} live={camLive[camera.cameraId]} className="min-h-0" />)}
      </div>
      {many && <div className="flex gap-2 overflow-x-auto">{cameras.map((camera) => <button type="button" key={camera.cameraId} aria-label={camera.purpose} onClick={() => onSelectCamera?.(camera.cameraId)} className="w-28 shrink-0 rounded border border-zinc-700 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><CameraTile camera={camera} live={camLive[camera.cameraId]} /></button>)}</div>}
    </div>
  );
}
