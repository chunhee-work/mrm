#!/bin/bash
# Bring the production photo model back after a crash or on a new Mac (user 2026-11-12).
# Needs: pip3 install huggingface_hub torch, and `hf auth login` once.
cd "$(dirname "$0")" && python3 backup_model.py restore && python3 swap_model.py show
