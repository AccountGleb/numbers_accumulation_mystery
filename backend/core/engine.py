"""
engine.py — the computation backend abstraction.

This is the seam that makes the architecture future-proof. Today it routes to
the pure-Python core (analysis.py). Tomorrow, to move the heavy number-crunching
to C++, you change ONLY this file — point `run_analysis` at a subprocess call to
a compiled binary that emits the same JSON, or at a pybind11 module. The Flask
layer and the frontend never change, because the contract (digits in, result
dict out) stays identical.

    Frontend (JS)  <->  Flask (app.py)  <->  engine.py  ->  [ Python core ]
                                                          \\-> [ C++ binary ]  (future)
"""

from __future__ import annotations

import numpy as np

from . import analysis

# Backend selector. Swap to "cpp" later and implement _run_cpp below.
BACKEND = "python"


def parse_input(raw: bytes) -> np.ndarray:
    """Validate and decode raw uploaded bytes into a digit array."""
    return analysis.parse_digits(raw)


def run_analysis(digits: np.ndarray, k_min: int = 2, k_max: int = 100,
                 mode: str = "default") -> dict:
    """Dispatch the analysis to the configured backend."""
    if BACKEND == "python":
        return analysis.analyze(digits, k_min, k_max, mode)
    if BACKEND == "cpp":
        return _run_cpp(digits, k_min, k_max)
    raise ValueError(f"Unknown backend: {BACKEND}")


def _run_cpp(digits: np.ndarray, k_min: int, k_max: int) -> dict:
    """Placeholder for the future C++ engine.

    Implementation sketch (later):
      1. Write `digits` to a temp .bin (or pass via stdin).
      2. subprocess.run(["./fourpi_core", tmp, "--json", str(k_min), str(k_max)])
      3. Parse stdout as JSON and return it.
    The C++ binary must emit exactly the dict shape that analysis.analyze does.
    """
    raise NotImplementedError("C++ backend not wired yet; set BACKEND='python'.")