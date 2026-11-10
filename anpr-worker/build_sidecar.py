#!/usr/bin/env python3
"""
Build the camera worker sidecar for the edge-client desktop app.

Usage (from anpr-worker/, inside the worker's virtualenv):
    python -m pip install pyinstaller
    python build_sidecar.py

Output:
    dist/camera-edge/camera-edge.exe   (Windows)
    dist/camera-edge/camera-edge       (Linux/macOS)

Copy the whole dist/camera-edge/ folder next to the edge-client executable.
Model weights are not part of the build; see README.md for the model layout.
"""

import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent
    spec_file = root / "camera-edge.spec"

    if not spec_file.exists():
        print(f"Error: {spec_file} not found")
        return 1

    # Run PyInstaller from the interpreter running this script, so the build
    # uses this environment's packages rather than whatever is on PATH.
    cmd = [sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", str(spec_file)]
    print("Building camera worker sidecar...")
    try:
        subprocess.run(cmd, check=True, cwd=root)
    except subprocess.CalledProcessError as exc:
        print(f"Build failed: {exc}")
        return 1
    print(f"Sidecar built: {root / 'dist' / 'camera-edge'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
