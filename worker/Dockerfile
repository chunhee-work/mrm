# Python 3.13, Node 24, Chromium. No GPU. Build on the worker machine; CI does not log in to Merimen.
FROM python:3.13-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg chromium \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
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
    PRED_BS=4
EXPOSE 8080
CMD ["python", "-m", "autopilot_worker"]
