"""GET /health for Fly or compose. No secrets and no Merimen calls."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


def serve(port: int, state: dict) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?", 1)[0] != "/health":
                self.send_response(404)
                self.end_headers()
                return
            body = json.dumps({"ok": True, "worker": state.get("id"), "model": state.get("model"), "chrome": bool(state.get("chrome"))}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            return

    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    Thread(target=httpd.serve_forever, daemon=True).start()
