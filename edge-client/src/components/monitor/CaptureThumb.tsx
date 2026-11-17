import { useEffect, useState } from "react";
import { captureImage } from "../../lib/tauri";

/** Loads a stored capture into an object URL (revoked on change/unmount); null when absent or unreadable. */
export function useCaptureUrl(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!key) return;
    let cancelled = false;
    let made: string | null = null;
    captureImage(key)
      .then((buf) => {
        if (cancelled) return;
        made = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
        setUrl(made);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);
  return url;
}

export function CaptureThumb({ imageKey }: { imageKey: string | null | undefined }) {
  const url = useCaptureUrl(imageKey);
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-850 text-xs text-fg-dim"
      style={{ width: 168, height: 96 }}
    >
      {url ? (
        <img src={url} alt="Ảnh chụp lúc nhận diện" className="h-full w-full object-cover" />
      ) : (
        "Chưa có ảnh"
      )}
    </div>
  );
}
