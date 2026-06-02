"""
app.py — Flask transport layer.

Responsibilities (and ONLY these): serve the static frontend, accept file
uploads, hand bytes to the engine, return JSON. No computation lives here.

Endpoints:
  GET  /                -> serves frontend/index.html
  GET  /<static file>   -> serves other frontend assets
  POST /api/analyze     -> multipart file upload, returns analysis JSON
  GET  /api/analyze/default -> analyze the bundled fourpi.bin (initial load)

Run:
  pip install flask numpy
  python app.py
  open http://127.0.0.1:5000
"""

from __future__ import annotations

import os
import time

import numpy as np
from flask import Flask, jsonify, request, send_from_directory

from core import parse_input, run_analysis

HERE = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(HERE, "..", "frontend"))
DEFAULT_BIN = os.path.join(HERE, "data", "fourpi.bin")

# Cap upload size to keep memory bounded (200 MB).
MAX_BYTES = 200 * 1024 * 1024

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_BYTES


# --------------------------------------------------------------------------- #
# Static frontend
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# --------------------------------------------------------------------------- #
# Analysis API
# --------------------------------------------------------------------------- #
# In-memory state. Single-user local app: we keep the most recently loaded
# digit array in RAM so edits can mutate it in place and re-run cheaply,
# without re-uploading. (Multi-user later would key this by session.)
# --------------------------------------------------------------------------- #
STATE = {"digits": None, "source": None, "mode": "default"}


def _analyze_digits(digits, source: str, mode: str = None) -> dict:
    """Run analysis on an in-memory digit array, time it, attach metadata."""
    if mode is None:
        mode = STATE["mode"]
    STATE["mode"] = mode
    t0 = time.monotonic()
    result = run_analysis(digits, mode=mode)
    result["source"] = source
    result["build_s"] = round(time.monotonic() - t0, 2)
    return result


def _analyze_bytes(raw: bytes, source: str, mode: str = None) -> dict:
    """Parse raw bytes, cache the digit array in RAM, analyze."""
    digits = parse_input(raw)            # may raise ValueError
    STATE["digits"] = digits
    STATE["source"] = source
    return _analyze_digits(digits, source, mode)


@app.post("/api/analyze")
def analyze_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file part in request."}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "No file selected."}), 400
    mode = request.form.get("mode", STATE["mode"])
    raw = f.read()
    try:
        result = _analyze_bytes(raw, source=f.filename, mode=mode)
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    return jsonify(result)


@app.post("/api/mode")
def set_mode():
    """Switch increment mode and re-analyze the cached dataset."""
    body = request.get_json(silent=True) or {}
    mode = body.get("mode")
    if mode not in ("default", "quadratic"):
        return jsonify({"error": f"Unknown mode: {mode}"}), 400
    if STATE["digits"] is None:
        # no data yet: just remember the choice
        STATE["mode"] = mode
        return jsonify({"mode": mode, "pending": True})
    result = _analyze_digits(STATE["digits"], STATE["source"], mode=mode)
    return jsonify(result)


@app.get("/api/analyze/default")
def analyze_default():
    if not os.path.exists(DEFAULT_BIN):
        return jsonify({"error": "No default dataset bundled."}), 404
    with open(DEFAULT_BIN, "rb") as fh:
        raw = fh.read()
    try:
        result = _analyze_bytes(raw, source=os.path.basename(DEFAULT_BIN))
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    return jsonify(result)


@app.get("/api/digit/<int:idx>")
def get_digit(idx):
    """Return the value at a given index of the cached digit array."""
    if STATE["digits"] is None:
        return jsonify({"error": "No dataset loaded yet."}), 409
    n = int(STATE["digits"].size)
    if not (0 <= idx < n):
        return jsonify({"error": f"Index {idx} out of range (0..{n-1})."}), 400
    return jsonify({"index": idx, "value": int(STATE["digits"][idx]), "total": n})


@app.post("/api/edit")
def edit_digits():
    """Apply in-place edits to the cached digit array and re-analyze.

    Body JSON: {"edits": [{"index": int, "value": int}, ...]}
    Indices may target any position in the loaded array (not just the first
    100) — the frontend currently only exposes the first 100, but the backend
    is ready for arbitrary-position edits.
    """
    if STATE["digits"] is None:
        return jsonify({"error": "No dataset loaded yet."}), 409
    body = request.get_json(silent=True) or {}
    edits = body.get("edits", [])
    if not isinstance(edits, list) or not edits:
        return jsonify({"error": "No edits provided."}), 400

    digits = STATE["digits"]
    n = int(digits.size)
    for e in edits:
        try:
            idx = int(e["index"])
            val = int(e["value"])
        except (KeyError, TypeError, ValueError):
            return jsonify({"error": "Each edit needs integer index and value."}), 400
        if not (0 <= idx < n):
            return jsonify({"error": f"Index {idx} out of range (0..{n-1})."}), 400
        if not (0 <= val <= 9):
            return jsonify({"error": f"Value {val} out of range (0..9)."}), 400
        digits[idx] = val  # mutate in place

    src = STATE["source"]
    label = f"{src} (edited)" if src and not src.endswith("(edited)") else (src or "edited")
    STATE["source"] = label
    result = _analyze_digits(digits, source=label)
    return jsonify(result)


@app.errorhandler(413)
def too_large(_):
    return jsonify({"error": f"File exceeds {MAX_BYTES // (1024*1024)} MB limit."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)