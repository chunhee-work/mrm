"""Used only by `check_build.py smoke`: any outgoing network connection raises, so a missing local file shows up at build time."""
import socket

def _blocked(*a, **k):
    raise OSError("network is blocked in the smoke test")

socket.socket.connect = _blocked
socket.create_connection = _blocked
