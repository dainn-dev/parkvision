# PyInstaller spec for building camera worker sidecar

# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['run_camera_pipeline.py'],
    pathex=[],
    binaries=[],
    datas=[
        # Include config examples
        ('camera-pipeline.dry-run.example.json', '.'),
        ('config.example.json', '.'),
    ],
    hiddenimports=[
        'edge.camera_config',
        'edge.camera_runtime',
        'edge.camera_processing_service',
        'edge.camera_ingest_client',
        'edge.camera_event_queue',
        'edge.camera_types',
        'edge.motion_gate',
        'edge.vehicle_detector',
        'edge.plate_detector',
        'edge.ocr_engine',
        'edge.vehicle_tracker',
        'edge.snapshot_store',
        'edge.tracker_state_store',
        'edge.prometheus_metrics',
        'edge.ipc_protocol',
        'edge.error_codes',
        # OpenCV dependencies
        'cv2',
        'numpy',
        # PIL dependencies
        'PIL',
        'PIL.Image',
        # Ultralytics dependencies
        'ultralytics',
        'torch',
        'torchvision',
        # PaddleOCR dependencies
        'paddleocr',
        'paddle',
        # Other
        'requests',
        'urllib3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'scipy',
        'pandas',
        'IPython',
        'jupyter',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='camera-edge',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Console app for stdout IPC
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='camera-edge',
)
