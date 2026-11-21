"""The owner's playbook, as the worker's AI reads it. `playbook/` is a committed copy of the repo's playbook/*.md and the name list
(scripts/sync-playbook.mjs; CI fails when a copy differs from the repo). The prose and the machine rules come from the same files the site uses."""

from __future__ import annotations

import json
import os
from functools import lru_cache

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "playbook")
SECTIONS = {
    "read_docs": ["01-read-documents.md"],
    "name_photos": ["03-photo-naming.md", "11-car-logos.md"],
    "step2": ["07-select-parts-and-labour.md", "08-estimate-details.md", "10-car-models.md"],
}


@lru_cache(maxsize=1)
def manifest() -> dict:
    with open(os.path.join(DIR, "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def version() -> str:
    return manifest()["version"]


def tag(env: dict | None = None) -> str:
    """`<content version>@<commit>`: same shape as the site's playbookTag()."""
    e = os.environ if env is None else env
    sha = (e.get("GIT_COMMIT") or e.get("GITHUB_SHA") or "")[:7]
    return f"{version()}@{sha or 'local'}"


@lru_cache(maxsize=8)
def block(kind: str) -> str:
    """One text block per kind of prompt that never changes between calls (so it belongs in the cached part of the system prompt)."""
    parts = []
    for name in SECTIONS[kind]:
        with open(os.path.join(DIR, name), encoding="utf-8") as f:
            parts.append(f'<playbook_file name="{name}">\n{f.read()}\n</playbook_file>')
    head = [
        f"The owner's playbook (version {version()}). These are the owner's own rules for this work: follow them.",
        "Parts that tell a person or a Mac script what to run, publish, click, upload or write to a file do not apply to you: use only the rules about what the documents mean, how parts are named and which parts to select.",
        "If a playbook line and the Answer section of this prompt disagree about the output format or the confidence scale, the Answer section wins.",
    ]
    return "\n\n".join(head + parts)


def names() -> list[str]:
    with open(os.path.join(DIR, "names.json"), encoding="utf-8") as f:
        return json.load(f)
