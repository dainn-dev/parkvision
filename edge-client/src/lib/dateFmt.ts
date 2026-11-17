const p2 = (n: number) => String(n).padStart(2, "0");

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormat(timeZone: string): Intl.DateTimeFormat | null {
  if (fmtCache.has(timeZone)) return fmtCache.get(timeZone) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    f = null; // unknown zone: fall back to device-local
  }
  fmtCache.set(timeZone, f);
  return f;
}

/** Calendar fields of `iso` in `timeZone` (IANA), or in device-local time when omitted/unknown. */
function parts(iso: string, timeZone?: string | null): Parts {
  const dt = new Date(iso);
  const f = timeZone ? zoneFormat(timeZone) : null;
  if (!f) {
    return {
      y: dt.getFullYear(),
      mo: dt.getMonth() + 1,
      d: dt.getDate(),
      h: dt.getHours(),
      mi: dt.getMinutes(),
      s: dt.getSeconds(),
    };
  }
  const all = f.formatToParts(dt);
  const v = (t: string) => Number(all.find((p) => p.type === t)?.value ?? 0);
  return { y: v("year"), mo: v("month"), d: v("day"), h: v("hour") % 24, mi: v("minute"), s: v("second") };
}

/** `HH:mm:ss dd/MM/yyyy`; in `timeZone` when given, else the device's local time. */
export function formatDateTime(iso: string, timeZone?: string | null): string {
  const t = parts(iso, timeZone);
  return `${p2(t.h)}:${p2(t.mi)}:${p2(t.s)} ${p2(t.d)}/${p2(t.mo)}/${t.y}`;
}

/** `HH:mm:ss`. */
export function formatHms(iso: string, timeZone?: string | null): string {
  const t = parts(iso, timeZone);
  return `${p2(t.h)}:${p2(t.mi)}:${p2(t.s)}`;
}

/** `HH:mm`. */
export function formatHm(iso: string, timeZone?: string | null): string {
  const t = parts(iso, timeZone);
  return `${p2(t.h)}:${p2(t.mi)}`;
}

/** `HH:mm`, or `dd/MM HH:mm` when `iso` is not on the same calendar day as `ref`. */
export function formatHmOrDay(iso: string, ref: string, timeZone?: string | null): string {
  const a = parts(iso, timeZone);
  const b = parts(ref, timeZone);
  const same = a.y === b.y && a.mo === b.mo && a.d === b.d;
  return same ? formatHm(iso, timeZone) : `${p2(a.d)}/${p2(a.mo)} ${formatHm(iso, timeZone)}`;
}
