"""
analysis.py — pure functional computation core.

No Flask, no file I/O, no globals. Every function takes data in and returns
data out. This isolation is what lets the engine swap this Python core for a
C++ backend later without touching the web layer.

The single public entry point is `analyze(digits, k_min, k_max)`, which returns
a plain dict (JSON-serializable) describing the full analysis.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

MAXLEVELS = 62


# --------------------------------------------------------------------------- #
# Low-level primitives
# --------------------------------------------------------------------------- #
# Increment modes: how each element contributes to the cumulative sum.
#   "default"   -> running sum of the values themselves
#   "quadratic" -> running sum of the SQUARES of the values
#   "every2nd"  -> running sum of only every 2nd element (positions 0,2,4,...)
# New modes can be added here without touching the rest of the pipeline.
# --------------------------------------------------------------------------- #
MODES = ("default", "quadratic", "every2nd")


def build_cumsum(digits: np.ndarray, mode: str = "default") -> np.ndarray:
    """Cumulative sum of the digit array as int64, per increment mode."""
    vals = digits.astype(np.int64)
    if mode == "quadratic":
        vals = vals * vals
    elif mode == "every2nd":
        # accumulate only elements at even positions (0,2,4,...)
        vals = vals[::2]
    return np.cumsum(vals)


def nearest(cs: np.ndarray, target: int) -> int:
    """Nearest value in the sorted (non-decreasing) array cs to target."""
    n = len(cs)
    i = int(np.searchsorted(cs, target))
    if i <= 0:
        return int(cs[0])
    if i >= n:
        return int(cs[-1])
    lo, hi = int(cs[i - 1]), int(cs[i])
    return lo if (target - lo) <= (hi - target) else hi


def odd_core(k: int) -> int:
    """k with all factors of 2 removed."""
    while k % 2 == 0:
        k //= 2
    return k


def family_tag(k: int) -> tuple[str, str]:
    """(label, css_class) as '<odd-core>x2^j'."""
    core = odd_core(k)
    cls = {3: "fam3", 5: "fam5", 7: "fam7", 9: "fam9"}.get(core, "famx")
    return f"{core}x2^j", cls


# --------------------------------------------------------------------------- #
# Per-k level diffs
# --------------------------------------------------------------------------- #
def level_diffs(cs: np.ndarray, k: int, max_val: int) -> list[int]:
    """Absolute |nearest - target| for each level n where k*2^n <= max_val."""
    out = []
    n = 0
    while True:
        target = k << n
        if target > max_val or target <= 0:
            break
        out.append(abs(nearest(cs, target) - target))
        n += 1
    return out


def level_detail(cs: np.ndarray, k: int, max_val: int) -> list[dict]:
    """Per-level detail for k: target, nearest cumsum value, signed diff."""
    out = []
    n = 0
    while True:
        target = k << n
        if target > max_val or target <= 0:
            break
        c = nearest(cs, target)
        out.append({"n": n, "target": target, "nearest": c, "diff": c - target})
        n += 1
    return out


def cumulative_avg(diffs: Sequence[int]) -> list[float]:
    """Running mean of diffs: position n = mean of diffs[0..n]."""
    out = []
    run = 0
    for i, d in enumerate(diffs):
        run += d
        out.append(run / (i + 1))
    return out


# --------------------------------------------------------------------------- #
# Convergence metrics
# --------------------------------------------------------------------------- #
def convergence_metrics(cum: Sequence[float]) -> tuple[float, float, float]:
    """(R, r, p) stability/convergence metrics for a cumulative series.

    R = tail stability 1 - std(last third)/std(all), ->1 = converged.
    r = mean error contraction ratio e(n+1)/e(n), <1 = contracting.
    p = power-law decay exponent: error ~ n^-p, larger = faster.
    """
    n = len(cum)
    if n < 3:
        return (float("nan"),) * 3

    final = cum[-1]

    def std(xs):
        if len(xs) < 2:
            return 0.0
        m = sum(xs) / len(xs)
        return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))

    whole = std(cum)
    tail = cum[max(1, (2 * n) // 3):]
    R = 1.0 - (std(tail) / whole) if whole > 1e-12 else 1.0

    err = [abs(v - final) for v in cum]
    ratios = [err[i + 1] / err[i] for i in range(len(err) - 1) if err[i] > 1e-9]
    r = sum(ratios) / len(ratios) if ratios else float("nan")

    xs, ys = [], []
    for i, e in enumerate(err[:-1], start=1):
        if e > 1e-9:
            xs.append(math.log(i))
            ys.append(math.log(e))
    if len(xs) >= 2:
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        num = sum((xs[i] - mx) * (ys[i] - my) for i in range(len(xs)))
        den = sum((xs[i] - mx) ** 2 for i in range(len(xs)))
        p = -(num / den) if abs(den) > 1e-12 else 0.0
    else:
        p = float("nan")

    return (R, r, p)


# --------------------------------------------------------------------------- #
# Raw-set randomness statistics
# --------------------------------------------------------------------------- #
def raw_randomness(digits: np.ndarray, num: int) -> tuple[list, dict]:
    """Digit-frequency table and classic randomness statistics for raw digits."""
    counts = np.bincount(digits.astype(np.int64), minlength=10)[:10]
    expected = num / 10.0

    digit_freq = []
    for d in range(10):
        c = int(counts[d])
        pct = 100.0 * c / num
        digit_freq.append({"digit": d, "count": c, "pct": pct, "dev": pct - 10.0})

    chi2 = float(np.sum((counts - expected) ** 2 / expected))
    p = counts / num
    nz = p[p > 0]
    entropy = float(-np.sum(nz * np.log2(nz)))
    max_entropy = float(np.log2(10))
    mean = float(digits.mean())
    var = float(digits.var())

    x = digits.astype(np.float64)
    if num > 1:
        denom = float(np.sum((x - mean) ** 2))
        serial = float(np.sum((x[:-1] - mean) * (x[1:] - mean)) / denom) if denom else 0.0
    else:
        serial = 0.0

    high_frac = float(np.mean(digits >= 5))
    above = digits >= 5
    n1 = int(np.sum(above))
    n2 = num - n1
    runs = int(1 + np.sum(above[1:] != above[:-1])) if num > 1 else 1
    exp_runs = 1.0 + 2.0 * n1 * n2 / num if (n1 and n2) else float("nan")

    stats = {
        "chi2": chi2, "dof": 9, "chi2_crit_05": 16.919,
        "entropy": entropy, "max_entropy": max_entropy,
        "entropy_pct": 100.0 * entropy / max_entropy,
        "mean": mean, "mean_exp": 4.5,
        "var": var, "var_exp": 8.25, "std": math.sqrt(var),
        "serial_corr": serial, "high_frac": high_frac,
        "runs": runs, "exp_runs": exp_runs,
        "min_count": int(counts.min()), "min_digit": int(counts.argmin()),
        "max_count": int(counts.max()), "max_digit": int(counts.argmax()),
    }
    return digit_freq, stats


# --------------------------------------------------------------------------- #
# Top-level orchestration
# --------------------------------------------------------------------------- #
def downsample(values: np.ndarray, target: int = 800) -> list[list]:
    """Uniformly subsample a series to ~target points for plotting.

    Returns [[index, value], ...] using the ORIGINAL 1-based index on x so the
    axis stays honest. Always includes the first and last point. Adapts to the
    data size: small series are returned in full, large ones are thinned.
    """
    n = int(values.size)
    if n == 0:
        return []
    if n <= target:
        return [[i + 1, int(v)] for i, v in enumerate(values.tolist())]
    # pick `target` evenly spaced indices, guaranteeing first and last
    idx = np.linspace(0, n - 1, target).round().astype(np.int64)
    idx = np.unique(idx)  # dedupe in case of rounding collisions
    return [[int(i) + 1, int(values[i])] for i in idx]


def analyze(digits: np.ndarray, k_min: int = 2, k_max: int = 100,
            mode: str = "default") -> dict:
    """Run the full analysis pipeline. Returns a JSON-serializable dict."""
    num = int(digits.size)
    cs = build_cumsum(digits, mode)
    max_val = int(cs[-1])

    # per-k diffs, rows, evolution
    per_k = {k: level_diffs(cs, k, max_val) for k in range(k_min, k_max + 1)}

    k_rows = []
    k_evolution = {}
    k_metrics = {}
    k_detail = {}
    for k in range(k_min, k_max + 1):
        diffs = per_k[k]
        levels = len(diffs)
        cum = cumulative_avg(diffs)
        avg = sum(diffs) / levels if levels else 0.0
        exact = sum(1 for d in diffs if d == 0)
        ex = 100.0 * exact / levels if levels else 0.0
        tag, cls = family_tag(k)
        R, r, p = convergence_metrics(cum)
        k_metrics[k] = (R, r, p)
        k_evolution[k] = [
            [k << n, round(cum[n], 4), 1 if diffs[n] == 0 else 0]
            for n in range(levels)
        ]
        k_detail[k] = level_detail(cs, k, max_val)
        k_rows.append({
            "k": k, "family": tag, "family_cls": cls,
            "avg": avg, "exact": ex, "levels": levels,
            "R": R, "r": r, "p": p, "core": odd_core(k),
            "is_root": 1 if k % 2 == 1 else 0,
        })

    # detailed k=6 (kept for the collapsible panel)
    k6 = []
    k6_overflow = None
    for n in range(MAXLEVELS):
        target = 6 << n
        if target > max_val:
            k6_overflow = {"n": n, "target": target, "max": max_val}
            break
        c = nearest(cs, target)
        k6.append({"n": n, "target": target, "nearest": c, "diff": c - target})

    # AVG evolution truncated to levels present in ALL k
    min_levels = min(len(v) for v in k_evolution.values())
    avg_evolution = [
        round(sum(k_evolution[k][n][1] for k in range(k_min, k_max + 1))
              / (k_max - k_min + 1), 4)
        for n in range(min_levels)
    ]

    # aggregate stats
    avg_vals = np.array([row["avg"] for row in k_rows])
    ex_vals = np.array([row["exact"] for row in k_rows])
    ks = [row["k"] for row in k_rows]
    R_arr = np.array([k_metrics[k][0] for k in ks])
    r_arr = np.array([k_metrics[k][1] for k in ks])
    p_arr = np.array([k_metrics[k][2] for k in ks])

    stats = {
        "mean_d": float(avg_vals.mean()), "mean_e": float(ex_vals.mean()),
        "med_d": float(np.sort(avg_vals)[len(avg_vals) // 2]),
        "med_e": float(np.sort(ex_vals)[len(ex_vals) // 2]),
        "std_d": float(avg_vals.std()), "std_e": float(ex_vals.std()),
        "min_d": float(avg_vals.min()), "min_dk": ks[int(avg_vals.argmin())],
        "max_d": float(avg_vals.max()), "max_dk": ks[int(avg_vals.argmax())],
        "min_e": float(ex_vals.min()), "min_ek": ks[int(ex_vals.argmin())],
        "max_e": float(ex_vals.max()), "max_ek": ks[int(ex_vals.argmax())],
        "mean_R": float(np.nanmean(R_arr)),
        "mean_r": float(np.nanmean(r_arr)),
        "mean_p": float(np.nanmean(p_arr)),
    }

    digit_freq, raw_stats = raw_randomness(digits, num)

    return {
        "num": num,
        "mode": mode,
        "max_val": max_val,
        "avg_digit": max_val / num,
        "first_digits": digits[:100].astype(int).tolist(),
        "first_cumsum": cs[:100].tolist(),
        "cumsum_sampled": downsample(cs, 800),
        "cumsum_total": num,
        "k_rows": k_rows,
        "k_evolution": {str(k): v for k, v in k_evolution.items()},
        "k_detail": {str(k): v for k, v in k_detail.items()},
        "avg_evolution": avg_evolution,
        "k6": k6,
        "k6_overflow": k6_overflow,
        "stats": stats,
        "digit_freq": digit_freq,
        "raw_stats": raw_stats,
    }


# --------------------------------------------------------------------------- #
# Input parsing / validation
# --------------------------------------------------------------------------- #
def parse_digits(raw: bytes) -> np.ndarray:
    """Parse raw .bin bytes into a digit array (0..9).

    Accepts two encodings, auto-detected:
      - one byte per digit with values 0..9 (like fourpi.bin)
      - ASCII digit characters '0'..'9' (bytes 48..57)
    Raises ValueError if the content does not look like digits.
    """
    arr = np.frombuffer(raw, dtype=np.uint8)
    if arr.size == 0:
        raise ValueError("File is empty.")

    # sample up to 100k bytes for validation (avoid scanning 100MB twice)
    sample = arr[:100_000]

    if np.all(sample <= 9):
        return arr.astype(np.int8)
    if np.all((sample >= 48) & (sample <= 57)):
        return (arr.astype(np.int16) - 48).astype(np.int8)

    raise ValueError(
        "File does not look like a digit stream. Expected bytes 0..9 "
        "or ASCII digit characters '0'..'9'."
    )