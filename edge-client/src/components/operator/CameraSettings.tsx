import type { CameraBinding } from "../../lib/tauri";

type Props = { cameras: CameraBinding[] };

export default function CameraSettings({ cameras }: Props) {
  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Camera</h3>
      {cameras.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa gán camera cho cổng này.</p>
      ) : (
        <div className="space-y-2">
          {cameras.map((camera) => (
            <div key={camera.cameraId} className="rounded-md bg-zinc-950 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-zinc-200">{camera.purpose.toUpperCase()}</span>
                <span className="text-xs text-zinc-500">{camera.cameraId}</span>
              </div>
              <p className="mt-1 truncate text-xs text-zinc-500" title={camera.streamUrl}>{camera.streamUrl}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-zinc-500">Liên kết camera được quản lý từ tenant dashboard.</p>
    </section>
  );
}
