"""Headless Detection Edge Service (Phase 3.3).

A Qt-free variant of the license-plate monitor that runs as a service: it reads
an RTSP stream, runs YOLOv5 detection + OCR, self-registers as a gate, sends
periodic heartbeats and POSTs confirmed plates to the backend check-vehicle
endpoint tagged with its gateId.

The detection logic mirrors ``license_plate_monitor.py`` but drops all PyQt/UI
code. The original desktop app is left untouched for backward compatibility.
"""
