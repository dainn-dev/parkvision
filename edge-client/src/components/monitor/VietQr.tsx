import QRCode from "qrcode";

/**
 * Renders a QR code as inline SVG. Uses qrcode's synchronous `create()` so it
 * renders in one pass (needed for print) and works without a canvas.
 */
export function VietQr({ payload, size }: { payload: string; size: number }) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 2;
  const total = n + quiet * 2;
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) cells.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return (
    <svg
      role="img"
      aria-label="Mã QR chuyển khoản"
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      style={{ background: "#fff" }}
    >
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}
