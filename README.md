# nums — cumulative-sum structure explorer

A web app for probing the hidden statistical structure of long digit sequences
(the digits of 4π, π, or any digit stream) through their **cumulative sum**, and
for asking a simple question with surprisingly deep consequences:

> When you accumulate a sequence of digits, how often — and how closely — does
> the running total land on "special" target numbers like `k·2ⁿ` or the
> multiples of `k`?

The app turns that question into tables, charts, and convergence metrics, and
lets you experiment with how the accumulation itself is defined.

---

## What this is really about

Take a digit sequence — say the digits of 4π: `1, 0, 4, 3, 3, 8, …` — and build
its **cumulative sum**: `1, 1, 5, 8, 11, 19, …`. Because the average digit is
~4.5, this running total climbs in an almost perfectly straight line with slope
~4.5. That single fact drives everything:

- The cumsum sweeps past the integer axis at a density of about `1 / 4.5 ≈ 22%`.
- So if you pick *any* family of target numbers (e.g. `k, 2k, 4k, 8k…`) and ask
  "did the running total hit it exactly?", you expect a hit roughly **22.22%**
  of the time, and the average distance to the nearest target to be about
  **1.5** — *regardless of which `k` you choose*.

The headline insight the app is built to make visible: those numbers
(`exact% ≈ 22.22`, `avg|diff| ≈ 1.5`) are **artifacts of coverage density**, not
special properties of any particular `k`. When you sort the table and see every
family hovering near the same values, you're looking at the law of large numbers
doing its work, not number-theoretic magic. The interface exists to let you
*feel* that — to sort, compare, drill into a single `k`, and watch its running
statistics converge toward the theoretical baseline.

That's why the UI looks the way it does:

- **The big sortable table** lets you rank all `k = 2..100` by `avg|diff|`,
  `exact%`, or convergence metrics, and immediately see they cluster — there are
  no real outliers, only sampling noise.
- **The per-`k` evolution chart** shows the *cumulative* `avg|diff|` as you add
  more levels, with a grey baseline (the all-`k` average) and a yellow trend
  line, so you can watch any individual family converge toward the global mean.
- **The convergence metrics (R, r, p)** quantify *how* a family settles down:
  tail stability, error-contraction ratio, and power-law decay exponent.
- **The randomness panel** (χ², entropy, serial correlation, runs, monobit)
  confirms the input really behaves like a random digit stream — the
  precondition for the whole "coverage density" argument.
- **The cumsum dynamics chart** plots the entire running total so you can
  literally see the ~4.5 slope, and any local deviations from it.

In short: it's an instrument for separating *signal* from *the appearance of
signal* in accumulated sequences.

---

## Features

### Two analysis modes (the `2ⁿ` vs `native` toggle)

> ⚠️ **Heads-up: `native` analysis is newly added and not yet optimized.** While
> the aggregate stats use a fast O(N) inversion, the per-`k` evolution curves and
> detail tables are still built from explicit multiples, which is slow on large
> inputs. On big datasets (tens to hundreds of millions of digits) the initial
> analysis may take long enough that the interface appears to hang while it
> finishes — this is expected for now. For quick exploration, use a smaller
> dataset, or stick to `2ⁿ` mode until native is optimized (see *Ideas for
> future work*).

The same machinery runs over two different families of target numbers, computed
in parallel and switched **instantly** with the **Native analysis** button (no
recompute — both are precomputed at load):

- **Powers-of-two (`k·2ⁿ`)** — the original question: targets `k, 2k, 4k, 8k…`.
  A sparse, geometrically spaced family.
- **Native multiples (`k·n`)** — *all* multiples of `k`: `k, 2k, 3k, 4k…`.
  A dense, arithmetically spaced family.

For native mode the math is done by **inversion**: instead of enumerating
millions of multiples, the distance of each cumsum value `v` to the nearest
multiple of `k` is `min(v mod k, k − v mod k)`, computed vectorized over the
whole array in O(N) per `k`. So `exact%` is just "what fraction of cumsum values
are divisible by `k`", and `avg|diff|` is the mean of those distances — no
storage of targets required. (Native `exact%` runs higher than `2ⁿ` — ~33% vs
~22% for `k=3` — because the multiples lattice is far denser than the powers
lattice.)

### Increment modes (how the cumsum is built)

The **Change mode** dropdown changes *how each element contributes* to the
running total. The active mode is shown in a centered indicator and ticked in
the menu. Switching recomputes from the in-RAM array — no re-upload needed.

| Mode | Rule | Example `{3,5,2,1,7,5}` → |
|------|------|---------------------------|
| **Default increment** | running sum of the values | `3, 8, 10, 11, 18, 23` |
| **Quadratic increment** | running sum of the **squares** | `9, 34, 38, 39, 88, 113` |
| **Increment of every 2nd** | sum of only even-position elements | `3, 5, 12` |

These are orthogonal to the analysis modes: *increment mode* defines the cumsum;
*analysis mode* defines the targets searched within it.

### The main table

`k = 2..100`, sortable by any column: `k`, family, `avg|diff|`, `exact%`,
convergence metrics `R`/`r`/`p`, and `levels`. Family labels are normalized to
`<odd-core>x2^j` form (`3x2^j`, `5x2^j`, …) and color-coded. A **hide members**
button collapses each family to its odd-core root. Conditional gradient
shading highlights values relative to the theoretical center (`avg|diff|` → 1.5,
`exact%` → 22.22).

### The evolution chart

Click any row to plot that `k`'s cumulative `avg|diff|` over its own levels
(log₂ x-axis for `2ⁿ`, linear for native). Includes:

- a **grey dashed baseline** (the all-`k` average),
- a **yellow dashed trend line** (least-squares fit in the plotted coordinates),
- **green dots** for exact hits (`diff = 0`),
- labels only on anomalous jumps, to avoid clutter,
- **right-click an end point to trim it** (with auto-rescale and a *reset*
  button) — handy for dropping the noisy first/last point so the real shape of
  the curve is visible.

### The cumsum dynamics chart

Plots the full cumulative-sum sequence (X = index, Y = running total). Adaptive
sampling keeps it to ~800 plotted points regardless of input size (hundreds to
hundreds of millions), always preserving the first and last point; sampling is
done on the backend so only the thinned series crosses the wire. The
sampling target is the `target` argument of `downsample()` in `analysis.py`.

### Live editing

- **Click the raw-digits panel** to open the editor.
- Enter an **index (id)** to look up any element of the loaded array (not just
  the first 100), see its current value, change it, and **Save**.
- The backend mutates the cached array in RAM, recomputes the cumsum and the
  full analysis, and the page refreshes under a *Processing…* overlay.

### Randomness panel & summary cards

Digit-frequency table, randomness statistics (χ², entropy, serial correlation,
runs, monobit, rarest/most-common digit), a `k`-summary (mean/median/std/min/max
of `avg|diff|` and `exact%`), and headline cards (max cumsum, average digit,
mean `exact%`, mean `avg|diff|`) — with the theoretical "pure random" reference
shown alongside.

---

## Architecture

```
frontend/                 vanilla JS/HTML/CSS — no build step
  index.html              DOM skeleton (populated by app.js)
  style.css               all styles + processing overlay + edit modal
  app.js                  fetch → render tables/charts, upload, edit, mode toggles

backend/
  app.py                  Flask: HTTP routes + in-RAM state, no math
  requirements.txt
  data/fourpi.bin         default dataset (loaded on startup)
  core/                   the computation engine (swappable)
    analysis.py           PURE functions: cumsum, k·2ⁿ, native multiples, metrics, stats
    engine.py             backend selector — the seam for a future C++ core
    __init__.py           exports parse_input, run_analysis
```

### The data contract

Frontend and backend communicate over one JSON shape (the dict returned by
`core.analysis.analyze`). The frontend never computes; it draws whatever the
backend sends. The analysis dict carries **both** `analysis.pow2` and
`analysis.native` blocks (each with `k_rows`, `k_evolution`, `k_detail`,
`avg_evolution`, `stats`) plus shared fields (`cumsum_sampled`, `raw_stats`,
`first_digits`, the current increment `mode`, etc.).

```
Frontend (JS)  <->  Flask (app.py)  <->  engine.py  ->  [ Python core ]
                                                      \->  [ C++ binary ]  (future)
```

### In-memory state

The backend keeps the most recently loaded digit array in RAM (`STATE`), so that
mode switches and single-element edits recompute cheaply without re-uploading
the file. This is a single-user local design; a multi-user deployment would key
this state by session.

---

## Run

```bash
cd backend
pip install -r requirements.txt
python app.py
# open http://127.0.0.1:5000
```

With Anaconda on Windows:

```bat
conda create -n nums python=3.12 -y
conda activate nums
cd backend
pip install -r requirements.txt
python app.py
```

On startup the app loads `backend/data/fourpi.bin`. Use the **Raw data → New
data** toolbar menu to upload a different `.bin`.

> ⚠️ Both analysis modes (`2ⁿ` and `native`) are computed up front so the
> toggle is instant — but because `native` is not yet optimized, **the initial
> load on a large dataset can be slow and may look like the app is hanging**
> while the native pass finishes. Use a smaller dataset for fast iteration.

> The bundled `fourpi.bin` may be a small placeholder. Replace it with your own
> digit file (same name, in `backend/data/`) to analyze real data.

## Accepted input

A `.bin` file that is a digit stream, auto-detected as either:
- one byte per digit, values `0..9` (like `fourpi.bin`), or
- ASCII digit characters `'0'..'9'` (bytes 48..57).

Anything else is rejected with a clear error (HTTP 422). The upload size limit
is set by `MAX_BYTES` in `app.py`.

## API

| Method | Path                    | Purpose                                            |
|--------|-------------------------|----------------------------------------------------|
| GET    | `/`                     | serve `index.html`                                 |
| GET    | `/<file>`               | serve frontend assets                              |
| GET    | `/api/analyze/default`  | analyze bundled `fourpi.bin`, cache it in RAM      |
| POST   | `/api/analyze`          | multipart upload (+ optional `mode`), returns JSON |
| POST   | `/api/mode`             | switch increment mode, recompute cached array      |
| GET    | `/api/digit/<idx>`      | read one element of the cached array by index      |
| POST   | `/api/edit`             | edit elements by index, recompute, return JSON     |

---

## Convergence metrics

For each `k`, the cumulative `avg|diff|` series is summarized by three numbers:

- **R** — tail stability: `1 − std(last third) / std(all)`. Closer to 1 means
  the curve has settled.
- **r** — mean error-contraction ratio between successive levels.
- **p** — power-law decay exponent fitted to the curve (how fast it converges).

These describe *the manner of convergence*, not just the endpoint, and make it
easy to spot families that settle quickly versus those that wander.

---

## Ideas for future work

The architecture was built to make these straightforward:

- **Optimize `native` analysis.** The aggregate stats already use a fast O(N)
  inversion, but the per-`k` evolution curves and detail tables still enumerate
  explicit multiples, which dominates load time on large inputs. These could be
  computed analytically (or capped/sampled) so native is as fast as `2ⁿ`.
- **More increment modes.** `build_cumsum(digits, mode)` in `analysis.py` is the
  single place that defines how elements accumulate. Adding a cubic increment,
  an alternating-sign walk (which turns the cumsum into a random walk near
  zero — see `pi_signed_cumsum.py`), a sliding-window sum, or any custom rule is
  one new branch plus a menu entry.
- **More analysis target families.** Alongside `k·2ⁿ` and `k·n`, one could add
  `k·3ⁿ`, Fibonacci-spaced targets, primes, or arbitrary user-defined lattices.
  The `native_block` inversion trick generalizes to any periodic lattice.
- **More statistics.** Spectral analysis of the cumsum (FFT / DMD / Koopman),
  autocorrelation, multifractal spectra, or diffusion-cone envelopes (`±√n·σ`)
  for signed/random-walk modes — all natural additions to the stats panel.
- **A C++ computation core.** `engine.py` is the only file that knows *how* the
  analysis runs. Set `BACKEND = "cpp"` and implement `_run_cpp` (a compiled
  binary via subprocess, or a pybind11 module) emitting the same JSON dict.
  Flask and the frontend stay untouched. This is the path to crunching
  multi-hundred-million-digit datasets at full speed.
- **Multi-user / session state.** Key the in-RAM `STATE` by session to allow
  concurrent users, or persist analyses for later comparison.
- **Neighborhood inspection in the editor.** Extend `/api/digit` to return a
  window around an index (e.g. elements `n−5 … n+5`) for context while editing.

---

## A note on the standalone scripts

`pi_signed_cumsum.py` (separate from the web app) generates the first *N* digits
of π, negates every second digit, and compares the resulting **signed** cumsum
to the plain one. The signed version is a random walk near zero — and looks
indistinguishable from a stock chart, which is the point: accumulated random
increments produce the same "trends," "support levels," and "head-and-shoulders"
shapes that people read meaning into on real financial charts. It's a compact
demonstration of structure that is entirely an artifact of accumulation.
