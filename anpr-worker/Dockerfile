# anpr-worker — headless camera ANPR pipeline.
#
# Default build is the CPU baseline per requirements-ocr.txt (paddlepaddle CPU).
#
# GPU build — swap base + paddle variant, never install both paddle builds:
#   docker build \
#     --build-arg BASE_IMAGE=pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime \
#     --build-arg PADDLE_PACKAGE=paddlepaddle-gpu==3.0.0 \
#     -t parkvision-anpr:cuda .
#   The pytorch base already ships CUDA torch/torchvision, so requirements.txt
#   resolves them as already satisfied.
#
# Tests run during build via:  docker build --target test .
#
# Runtime: model weights are NOT in the image — mount them and point the
# generated camera config at that path:
#   docker run --rm -v "$PWD/models:/models:ro" parkvision-anpr \
#       --config /models/camera.json --run-camera
#   (Keep weights outside model/ or mount individual files — a full-dir mount
#    over model/ would shadow the vendored ultralytics_yolov5_master source
#    needed to load the plate checkpoint.)

ARG BASE_IMAGE=python:3.11-slim-bookworm
FROM ${BASE_IMAGE} AS base

# paddlepaddle-gpu builds need a CUDA base; CPU builds keep the default.
ARG PADDLE_PACKAGE=paddlepaddle==3.0.0
# CPU wheel index keeps the baseline image small; the GPU base image already
# ships CUDA torch/torchvision so pass an empty value to reuse them.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# libgl1/libglib2.0-0: opencv; libgomp1: paddle OpenMP runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN if [ -n "${TORCH_INDEX_URL}" ]; then \
        pip install torch torchvision --index-url "${TORCH_INDEX_URL}"; \
    fi \
    && pip install -r requirements.txt \
    && pip install paddleocr==2.10.0 "${PADDLE_PACKAGE}"

COPY edge/ edge/
COPY model/ model/
COPY run_camera_pipeline.py ./
COPY camera-pipeline.dry-run.example.json ./

FROM base AS test
RUN pip install pytest && python -m pytest edge/ -q

FROM base AS runtime
ENTRYPOINT ["python", "run_camera_pipeline.py"]
CMD ["--help"]
