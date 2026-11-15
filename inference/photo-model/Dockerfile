# Photo-model service for a PRIVATE Hugging Face Docker Space (plan: chunhee-work/mrm#26, Revision 6).
# Same runtime as the original machine (typesafe/photo_train/requirements.txt): Python 3.9, torch 2.8.0, torchvision 0.23.0.
# Build secret (never ENV/ARG): HF_TOKEN, read access to the model repo only.
FROM python:3.9-slim

# Commit sha of chunhee00/mrm-photo-model to serve (set as a Space variable; the build refuses an empty value).
ARG HF_REVISION
# Pinned dinov2 copy that predict_case.py loads from ~/.cache/torch/hub/facebookresearch_dinov2_main (source="local").
ARG DINOV2_COMMIT=7764ea0f912e53c92e82eb78a2a1631e92725fc8

RUN apt-get update && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
ENV HOME=/home/user TORCH_HOME=/app/torch_home PYTHONUNBUFFERED=1 PATH=/home/user/.local/bin:$PATH
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# dinov2 code at a pinned commit, with the same one-line patch the original Mac needed on Python 3.9.
RUN mkdir -p /home/user/.cache/torch/hub \
 && git clone https://github.com/facebookresearch/dinov2.git /home/user/.cache/torch/hub/facebookresearch_dinov2_main \
 && git -C /home/user/.cache/torch/hub/facebookresearch_dinov2_main checkout "$DINOV2_COMMIT" \
 && rm -rf /home/user/.cache/torch/hub/facebookresearch_dinov2_main/.git \
 && find /home/user/.cache/torch/hub/facebookresearch_dinov2_main -name '*.py' -exec sed -i '1i from __future__ import annotations' {} +

# The private checkpoints: pinned revision, secret mounted for this one step only. production/ -> /app/models/
RUN test -n "$HF_REVISION" || (echo 'HF_REVISION (a commit sha) must be set' && exit 1)
RUN --mount=type=secret,id=HF_TOKEN \
    python -c "import os; from huggingface_hub import snapshot_download; \
snapshot_download('chunhee00/mrm-photo-model', revision='${HF_REVISION}', allow_patterns=['production/*'], local_dir='/app/dl', token=open('/run/secrets/HF_TOKEN').read().strip())" \
 && mkdir -p /app/models && cp /app/dl/production/* /app/models/ && rm -rf /app/dl

COPY predict_case.py zones.py core.py app.py dump_labels.py SOURCE.sha256 check_build.py ./
# Build fails if the unchanged script was edited, or a file named in production.json is missing; the token must not be in the image.
RUN grep -v '^#' SOURCE.sha256 | sha256sum -c - \
 && python check_build.py files \
 && chown -R user:user /app /home/user
USER user
# Smoke test as the RUNTIME user with the network blocked: runs the unchanged script on a tiny fixture. Everything it needs
# (dinov2 code, checkpoints) must already be in the image, so a runtime that cannot download still works.
COPY nonet/sitecustomize.py /app/nonet/sitecustomize.py
RUN python check_build.py smoke

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log", "--log-level", "warning"]
