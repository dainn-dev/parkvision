import { useState } from "react";

export function WaiveDialog({
  gateName,
  busy = false,
  onCancel,
  onConfirm,
}: {
  gateName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="waive-title"
      className="rounded-lg border border-neutral-300 bg-white p-4 text-neutral-900 shadow-xl"
    >
      <h2 id="waive-title" className="mb-2 text-lg font-bold">
        Miễn phí — {gateName}
      </h2>
      <label className="block text-sm font-medium" htmlFor="waive-reason">
        Lý do miễn phí
      </label>
      <textarea
        id="waive-reason"
        className="mt-1 w-full rounded border border-neutral-300 p-2"
        rows={3}
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="rounded border px-3 py-2" onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className="rounded bg-neutral-900 px-3 py-2 font-semibold text-white disabled:opacity-40"
          disabled={trimmed === "" || busy}
          onClick={() => onConfirm(trimmed)}
        >
          Xác nhận miễn phí
        </button>
      </div>
    </div>
  );
}
