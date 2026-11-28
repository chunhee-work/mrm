"""One process-wide lock for PyMuPDF (fitz). PyMuPDF is not thread-safe: with WORKER_SLOTS > 1 two slots could render PDFs at the
same time (a document shrink during Phase A uploads, the Jev page sort after a Phase A), which can corrupt a render or crash the
process. Every use of fitz holds this lock (plan #150, egm r7)."""

from __future__ import annotations

import threading

LOCK = threading.RLock()
