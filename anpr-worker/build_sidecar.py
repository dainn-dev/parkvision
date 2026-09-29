#!/usr/bin/env python3
"""
Build sidecar executable for Tauri desktop app.

Usage:
    python build_sidecar.py

Requirements:
    pip install pyinstaller

Output:
    dist/camera-edge/camera-edge.exe (Windows)
    dist/camera-edge/camera-edge (Linux/macOS)
"""

import sys
import subprocess
from pathlib import Path


def main():
    spec_file = Path(__file__).parent / "camera-edge.spec"

    if not spec_file.exists():
        print(f"Error: {spec_file} not found")
        return 1

    print("Building camera worker sidecar...")
    print(f"Spec file: {spec_file}")

    cmd = ["pyinstaller", "--clean", str(spec_file)]

    try:
        subprocess.run(cmd, check=True)
        print("\n✅ Sidecar built successfully!")
        print("Output: dist/camera-edge/")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Build failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
