import { useEffect, useRef, useState } from "react";

export function ManualPlateDialog({
  gateName,
  onSubmit,
  onClose,
}: {
  gateName: string;
  onSubmit: (plate: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = () => {
    const plate = value.trim().toUpperCase();
    if (!plate) return;
    onSubmit(plate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-plate-title"
        className="w-[420px] rounded-[14px] border border-ink-800 bg-ink-900 p-5 text-fg"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="manual-plate-title" className="mb-3 text-base font-bold">
          Nhập biển số tay — {gateName}
        </h2>
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="VD: 30E-892.41"
          aria-label="Biển số"
          className="min-h-[44px] w-full rounded-[10px] border border-ink-700 bg-ink-950 px-3 font-mono text-lg text-fg placeholder:text-fg-dim"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[10px] border border-ink-700 px-4 font-semibold"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={submit}
            className="min-h-[44px] rounded-[10px] bg-fg px-4 font-bold text-ink-950"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}
