"""
Simple MJPEG server for camera preview delivery to Tauri UI.

Binds only to 127.0.0.1 for security.
Serves MJPEG streams for Entry/Exit cameras.
"""

import io
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread, Lock
from typing import Dict, Optional
import base64

from PIL import Image


class PreviewFrame:
    """Thread-safe container for latest preview frame"""
    def __init__(self):
        self.jpeg_data: Optional[bytes] = None
        self.lock = Lock()

    def update(self, jpeg_bytes: bytes):
        with self.lock:
            self.jpeg_data = jpeg_bytes

    def get(self) -> Optional[bytes]:
        with self.lock:
            return self.jpeg_data


class MJPEGHandler(BaseHTTPRequestHandler):
    """HTTP handler for MJPEG streams"""

    # Class-level camera registry
    cameras: Dict[str, PreviewFrame] = {}

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

    def do_GET(self):
        """Handle GET requests for camera streams"""
        # Parse camera ID from path: /camera/{cameraId}
        if not self.path.startswith('/camera/'):
            self.send_error(404, "Not Found")
            return

        camera_id = self.path[8:]  # Remove '/camera/' prefix

        if camera_id not in self.cameras:
            self.send_error(404, f"Camera {camera_id} not found")
            return

        # Send MJPEG headers
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()

        frame_source = self.cameras[camera_id]

        try:
            while True:
                jpeg_data = frame_source.get()

                if jpeg_data:
                    # Write MJPEG frame with boundary
                    self.wfile.write(b'--frame\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n')
                    self.wfile.write(f'Content-Length: {len(jpeg_data)}\r\n'.encode())
                    self.wfile.write(b'\r\n')
                    self.wfile.write(jpeg_data)
                    self.wfile.write(b'\r\n')

                time.sleep(0.1)  # ~10 FPS max

        except (ConnectionResetError, BrokenPipeError):
            # Client disconnected
            pass


class PreviewServer:
    """MJPEG preview server for Tauri UI"""

    def __init__(self, host='127.0.0.1', port=8765):
        self.host = host
        self.port = port
        self.server: Optional[HTTPServer] = None
        self.thread: Optional[Thread] = None

    def start(self):
        """Start the MJPEG server in background thread"""
        if self.thread and self.thread.is_alive():
            return  # Already running

        self.server = HTTPServer((self.host, self.port), MJPEGHandler)

        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

        print(f"Preview server started at http://{self.host}:{self.port}")

    def stop(self):
        """Stop the MJPEG server"""
        if self.server:
            self.server.shutdown()
            self.server = None

        if self.thread:
            self.thread.join(timeout=2)
            self.thread = None

    def register_camera(self, camera_id: str) -> str:
        """
        Register a camera for preview streaming.
        Returns the stream URL.
        """
        if camera_id not in MJPEGHandler.cameras:
            MJPEGHandler.cameras[camera_id] = PreviewFrame()

        return f"http://{self.host}:{self.port}/camera/{camera_id}"

    def update_frame(self, camera_id: str, jpeg_base64: str):
        """Update preview frame for a camera"""
        if camera_id not in MJPEGHandler.cameras:
            return

        jpeg_bytes = base64.b64decode(jpeg_base64)
        MJPEGHandler.cameras[camera_id].update(jpeg_bytes)

    def unregister_camera(self, camera_id: str):
        """Unregister camera when worker stops"""
        MJPEGHandler.cameras.pop(camera_id, None)


# Global singleton instance
_preview_server: Optional[PreviewServer] = None


def get_preview_server() -> PreviewServer:
    """Get or create the global preview server instance"""
    global _preview_server
    if _preview_server is None:
        _preview_server = PreviewServer()
        _preview_server.start()
    return _preview_server
