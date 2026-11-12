"""2026-11-12 (user: the model must survive a crash / shutdown): write checkpoints to <path>.tmp, flush to disk,
then os.replace() -> the real file is either the old complete one or the new complete one, never half-written."""
import os
import torch


def atomic_save(obj, path):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        torch.save(obj, f)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)
