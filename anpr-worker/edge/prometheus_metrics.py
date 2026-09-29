"""Minimal dependency-free Prometheus endpoint for one camera pipeline process."""

from __future__ import annotations

from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading


class EdgeMetrics:
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        self._counters: Counter[tuple[str, str]] = Counter()
        self._lock = threading.Lock()

    def ocr_attempt(self, outcome: str) -> None:
        with self._lock:
            self._counters[("ocr", outcome)] += 1

    def render(self) -> bytes:
        with self._lock:
            values = dict(self._counters)
        camera = self.camera_id.replace("\\", "\\\\").replace('"', '\\"')
        lines = ["# HELP edge_ocr_attempts_total OCR candidate attempts by outcome.",
                 "# TYPE edge_ocr_attempts_total counter"]
        for outcome in ("complete", "failed"):
            lines.append(f'edge_ocr_attempts_total{{camera="{camera}",outcome="{outcome}"}} {values.get(("ocr", outcome), 0)}')
        return ("\n".join(lines) + "\n").encode()


class MetricsServer:
    def __init__(self, metrics: EdgeMetrics, port: int):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path not in {"/metrics", "/metrics/"}:
                    self.send_error(404)
                    return
                payload = metrics.render()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, _format, *_args):
                return

        self._server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, name="edge-metrics", daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=2)
