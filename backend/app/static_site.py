"""Serve the statically exported frontend from the same origin as the API."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

DEFAULT_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


def mount_frontend(app: FastAPI) -> None:
    """Mount the exported frontend at "/" if present.

    Must be called AFTER all API routes are registered so /api/* keeps priority.
    """
    static_dir = Path(os.environ.get("STATARB_STATIC_DIR") or DEFAULT_STATIC_DIR)
    if not (static_dir / "index.html").is_file():
        return
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
