# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the camera worker sidecar (one-folder build).
#
# Model weights and the vendored YOLOv5 source are NOT bundled: the worker
# loads them at runtime from the model directory named in its config
# (edge-client: PARKVISION_ANPR_MODEL_DIR or <app_data>/models).

from importlib.util import find_spec

from PyInstaller.utils.hooks import collect_all

datas = [('camera-pipeline.dry-run.example.json', '.')]
binaries = []
hiddenimports = [
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
    'cv2',
    'numpy',
    'PIL',
    'PIL.Image',
    'torch',
    'torchvision',
    'requests',
    'urllib3',
    'lap',
    # Imported by the YOLOv5 source that torch.hub loads from the model
    # directory at runtime. PyInstaller never sees those imports, so they
    # must be named here.
    'pandas',
    'scipy',
    'matplotlib',
    'matplotlib.pyplot',
    'matplotlib.backends.backend_agg',
    'psutil',
    'yaml',
    'tqdm',
    'packaging',
]

# Packages that load submodules, data files or native libraries dynamically.
COLLECT_ALL = (
    'ultralytics',   # default.yaml, tracker configs
    'paddleocr',     # imports ppocr/tools by path, ships dictionaries
    'paddle',        # native inference libraries
    'pyclipper',
    'shapely',
    'skimage',
    'imgaug',
    'lmdb',
    'seaborn',
    'git',
    'thop',
)


def _vendored_yolov5_imports():
    """Every importable module the vendored YOLOv5 loader code imports.

    That source is loaded from the model directory at runtime, so anything
    it imports that the worker itself never does (logging.config, ...) is
    invisible to PyInstaller and has to be listed.
    """
    import ast
    from pathlib import Path

    repository = Path(SPECPATH) / 'model' / 'ultralytics_yolov5_master'
    sources = [repository / 'hubconf.py',
               *(repository / 'models').glob('*.py'),
               *(repository / 'utils').glob('*.py')]
    local_or_excluded = {'models', 'utils', 'tensorflow', 'IPython', 'tensorboard'}
    names = set()
    for source in sources:
        tree = ast.parse(source.read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names.add(node.module)
    importable = []
    for name in sorted(names):
        if name.split('.')[0] in local_or_excluded:
            continue
        try:
            if find_spec(name) is not None:
                importable.append(name)
        except (ImportError, ValueError):
            continue
    return importable


hiddenimports += _vendored_yolov5_imports()


def _paddleocr_dependency_modules():
    """Top-level modules of everything paddleocr declares as a requirement.

    paddleocr imports most of its dependencies (python-docx, bs4, ...) at
    import time from modules it loads by path, so static analysis misses
    them and the frozen worker fails with "No module named ...".
    """
    from importlib.metadata import PackageNotFoundError, packages_distributions, requires

    from packaging.requirements import Requirement
    from packaging.utils import canonicalize_name

    already_handled = {'numpy', 'paddlepaddle', 'opencv-python', 'opencv-contrib-python'}
    modules_by_distribution = {}
    for module, distributions in packages_distributions().items():
        for distribution in distributions:
            modules_by_distribution.setdefault(canonicalize_name(distribution), set()).add(module)
    try:
        declared = requires('paddleocr') or []
    except PackageNotFoundError:
        return []
    modules = set()
    for line in declared:
        requirement = Requirement(line)
        if requirement.marker is not None and not requirement.marker.evaluate():
            continue
        name = canonicalize_name(requirement.name)
        if name not in already_handled:
            modules |= modules_by_distribution.get(name, set())
    return sorted(module for module in modules if not module.startswith('_'))


# torchvision registers its C++ operators (torchvision::nms) from a native
# library that is only found when the whole package is collected.
packages_to_collect = list(dict.fromkeys(
    (*COLLECT_ALL, 'torchvision', *_paddleocr_dependency_modules())))
for package in packages_to_collect:
    if find_spec(package) is None:
        continue
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

a = Analysis(
    ['run_camera_pipeline.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'IPython',
        'jupyter',
        'tensorflow',
        'tensorboard',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='camera-edge',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # Console app: stdout carries the JSONL IPC stream
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='camera-edge',
)
