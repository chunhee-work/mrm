"""The photo model's learning data (playbook 03 "Learning loop after the user reviews 照片命名台").

Every photo's FINAL name goes into `photo_learning` when Done is pressed: the label the next training build uses, flagged `changed` when the
adjuster's name differs from the model's (a correction, the most valuable rows). Own database only: nothing here talks to Merimen or to the model.
`export` hands the open rows to a training build as JSON lines and marks them taken (`python -m autopilot_worker.learning export`)."""

from __future__ import annotations

from .photo_rules import shown_name


def rows_for(case: dict, desk: list[dict]) -> list[dict]:
    """One row per photo that has a final name: {photo_id, content_hash, blob_path, model_name, label, changed}."""
    out = []
    for r in desk:
        label = shown_name(r)
        if not label or r.get("id") is None:
            continue
        model = r.get("model_name")
        out.append({
            "photo_id": r["id"], "content_hash": r.get("content_hash"), "blob_path": r.get("blob_path") or "",
            "model_name": model, "label": label, "changed": bool(r.get("final_name")) and r.get("final_name") != model,
        })
    return out


def export_open(repo, limit: int = 5000) -> list[dict]:
    """The rows not yet taken into a training build, oldest first; marks them taken."""
    return repo.take_learning(limit)


def main(argv: list[str] | None = None) -> int:
    import json
    import sys

    from .config import Config
    from .store import PgRepo

    args = sys.argv[1:] if argv is None else argv
    if not args or args[0] != "export":
        print("usage: python -m autopilot_worker.learning export  (JSON lines on stdout, rows marked as exported)", file=sys.stderr)
        return 2
    cfg = Config.from_env()
    repo = PgRepo(cfg.database_url, cfg.db_transport)
    for row in export_open(repo):
        print(json.dumps(row, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
