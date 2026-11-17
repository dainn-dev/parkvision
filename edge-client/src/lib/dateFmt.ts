const p2 = (n: number) => String(n).padStart(2, "0");

/** `HH:mm:ss dd/MM/yyyy` in the device's local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** `HH:mm` in local time. */
export function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** `HH:mm`, or `dd/MM HH:mm` when `iso` is not on the same local day as `ref`. */
export function formatHmOrDay(iso: string, ref: string): string {
  const d = new Date(iso);
  const r = new Date(ref);
  const same = d.toDateString() === r.toDateString();
  return same ? formatHm(iso) : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${formatHm(iso)}`;
}
