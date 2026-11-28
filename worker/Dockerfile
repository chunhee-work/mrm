# Python 3.13, Node 24, Chromium. No GPU. Build on the worker machine; CI does not log in to Merimen.
FROM python:3.13-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg chromium \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# photo model: CPU-only torch, and the DINOv2 model code predict_case loads with torch.hub (source="local", no download at run time).
# Before requirements.txt so a requirements change does not download torch again. The last line builds both backbones once
# (no weights): a DINOv2 or torch problem fails the BUILD instead of every photo job falling back to Claude.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.8.0 \
    && mkdir -p /opt/dinov2_hub \
    && curl -fsSL https://github.com/facebookresearch/dinov2/archive/7764ea0f912e53c92e82eb78a2a1631e92725fc8.tar.gz \
       | tar -xz --strip-components=1 -C /opt/dinov2_hub \
    && python -c "import torch; [torch.hub.load('/opt/dinov2_hub', m, source='local', pretrained=False) for m in ('dinov2_vitb14', 'dinov2_vitl14')]"
COPY worker/requirements.txt /app/worker/requirements.txt
RUN pip install --no-cache-dir -r /app/worker/requirements.txt
COPY worker /app/worker
COPY typesafe/photo_train /app/typesafe/photo_train
# manual estimate rows: the owner's reference prices (worker/autopilot_worker/manual_price.py; PRICE_DATA_DIR overrides the folder)
COPY tools/price_lookup.py tools/merimen-part-prices-data.md /app/tools/
ENV PYTHONPATH=/app/worker \
    CHROME_BIN=chromium \
    CHROME_NO_SANDBOX=on \
    WORKER_STATE=/var/lib/autopilot-worker \
    PRED_BS=4 \
    DINOV2_HUB=/opt/dinov2_hub
EXPOSE 8080
CMD ["python", "-m", "autopilot_worker"]
