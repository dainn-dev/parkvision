import { useState, type ReactNode } from "react";
import type { CameraBinding } from "../../lib/tauri";
import type { CamLiveInfo } from "../../lib/useEdgeData";

const PURPOSE_CHIP: Record<string, string> = {
  plate: "CAM BIỂN SỐ",
  overview: "CAM TOÀN CẢNH",
};

const isError = (s?: string) => s === "error" || s === "worker_error";

export function CameraView({
  cameras,
  camLive,
  gateName,
  children,
}: {
  cameras: CameraBinding[];
  camLive: Record<string, CamLiveInfo>;
  gateName: string;
  /** Overlays anchored to the video area (e.g. the entry photo). */
  children?: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const shown =
    cameras.find((c) => c.cameraId === picked) ??
    cameras.find((c) => c.purpose === "plate") ??
    cameras[0];
  const live = shown ? camLive[shown.cameraId] : undefined;
  const hasFrame = !!live?.jpeg && !isError(live.state);

  let message = "Đang chờ tín hiệu camera…";
  if (!shown) message = "Chưa gán camera";
  else if (isError(live?.state) && live?.detail) message = live.detail;

  return (
    <div
      className="relative min-h-[160px] flex-1 overflow-hidden rounded-[10px] bg-ink-video"
      style={{ minHeight: 160 }}
    >
      {hasFrame ? (
        <img
          src={`data:image/jpeg;base64,${live!.jpeg}`}
          alt={`${gateName} — camera trực tiếp`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-fg-muted">
          {message}
        </div>
      )}
      {live?.state === "live" ? (
        <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-alert" />
          LIVE
        </span>
      ) : null}
      {cameras.length > 1 ? (
        <div className="absolute bottom-2 left-2 flex gap-1">
          {cameras.map((c) => {
            const on = c.cameraId === shown?.cameraId;
            return (
              <button
                key={c.cameraId}
                type="button"
                onClick={() => setPicked(c.cameraId)}
                aria-pressed={on}
                className={`min-h-[44px] min-w-[44px] rounded-md px-3 text-[11px] font-bold ${
                  on ? "bg-fg text-ink-950" : "bg-black/60 text-white"
                }`}
              >
                {PURPOSE_CHIP[c.purpose] ?? c.purpose.toUpperCase()}
              </button>
            );
          })}
        </div>
      ) : null}
      {children}
    </div>
  );
}
