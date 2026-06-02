"""Core computation package: pure analysis + backend-swappable engine."""

from .engine import parse_input, run_analysis

__all__ = ["parse_input", "run_analysis"]