import { formatHm } from "../../lib/dateFmt";

/** Entry capture shown on the exit lane's camera area (bottom-right, 176 px). */
export function EntryPhotoOverlay({
  src,
  enteredAt,
  entryGateName,
}: {
  src: string | null;
  enteredAt: string;
  entryGateName?: string | null;
}) {
  const caption = `Lúc vào · ${formatHm(enteredAt)}${entryGateName ? ` · ${entryGateName}` : ""}`;
  return (
    <div
      className="absolute bottom-2 right-2 overflow-hidden rounded-lg bg-black/80 text-white"
      style={{ width: 176 }}
    >
      {src ? (
        <img src={src} alt="Ảnh xe lúc vào" className="block h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center text-xs">Không có ảnh lúc vào</div>
      )}
      <div className="px-2 py-1 text-xs">{caption}</div>
    </div>
  );
}
