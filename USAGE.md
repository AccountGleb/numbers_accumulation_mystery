# How to use the interface — a plain guide

This is a step-by-step guide to checking numbers with the app. No theory, no
jargon — just what to click and what you'll see. If you want the *why* behind it
all, read the README; this page is purely *how*.

---

## The 30-second version

1. Open the app — it loads a dataset automatically.
2. Look at the **big table**: every row is a number `k` from 2 to 100.
3. **Click a column header** to sort (e.g. click `exact%` to rank by best hits).
4. **Click a row** to see that number's chart on the right.

That's the whole loop. Everything below just explains each piece.

---

## What you're looking at

When the page loads, you'll see several blocks stacked top to bottom:

```
┌─────────────────────────────────────────────┐
│  Toolbar:  Raw data | Change mode             │  ← controls
├─────────────────────────────────────────────┤
│  Summary cards + randomness panel            │  ← overview of the data
├─────────────────────────────────────────────┤
│  Cumulative-sum dynamics chart               │  ← the running total, full view
├─────────────────────────────────────────────┤
│  Big table (k = 2..100)   |   Evolution chart│  ← the main tool
├─────────────────────────────────────────────┤
│  AVG summary row                             │  ← the overall average
├─────────────────────────────────────────────┤
│  Detailed table (for the selected k)         │  ← drill-down
└─────────────────────────────────────────────┘
```

---

## Step 1 — Pick the data

By default the app analyzes a built-in dataset. To check your own numbers:

- Click **Raw data** in the toolbar → **New data** → choose a `.bin` file.
- A *Processing…* overlay appears while it works, then the whole page updates.

Your file just needs to be a stream of digits (one digit per byte `0..9`, or
plain text digits `0123…`). If the file isn't digits, you'll get a clear error.

---

## Step 2 — Read the big table

This is the heart of the app. Each row is a number `k` (from 2 to 100). The
columns tell you how well that number "shows up" in the running total:

| Column | What it means in plain words |
|--------|------------------------------|
| **k** | the number being checked (2, 3, 4, …) |
| **family** | which group it belongs to (related numbers share a family color) |
| **avg\|diff\|** | on average, how *far* the running total lands from this number's targets (smaller = lands closer) |
| **exact%** | how often the running total hits a target *exactly* (bigger = more direct hits) |
| **R, r, p** | how steadily the number "settles down" as you check more of it (see README) |
| **levels** | how many targets were checked for this number |

**The key thing to notice:** sort by `avg|diff|` or `exact%` and you'll see
almost every number clusters around the same values (~1.5 and ~22%). That
sameness *is the result* — it shows no single number is special; the pattern is
just how accumulated digits behave. Hunting for an outlier? There usually isn't
one, and seeing that is the point.

### Sorting

**Click any column header** to sort by it. Click again to reverse. Want to find
the numbers with the most exact hits? Click **exact%**. Want the closest
average? Click **avg|diff|**.

### Decluttering

Click **hide members** to collapse each family down to its root number, so you
see one representative per family instead of all of them. Click again to expand.

---

## Step 3 — Drill into one number

**Click any row** in the big table. Two things happen:

1. **The chart on the right** redraws for that number, showing how its average
   distance settles as you check more and more targets.
2. **The Detailed table at the bottom** fills in with that number's targets one
   by one — the target, the closest value the running total reached, and the
   difference (`EXACT` in green if it hit dead-on).

### Reading the chart

- **Blue line + dots** — the running average distance. Watch it settle toward a
  steady level.
- **Green dots** — exact hits (distance = 0).
- **Grey dashed line** — the overall average across *all* numbers, for
  comparison. If the blue line hugs the grey one, this number is behaving
  exactly like the average (i.e. nothing special).
- **Yellow dashed line** — the trend, showing the general direction.

### Cleaning up a noisy chart

The very first or last point is often an outlier that squashes the rest of the
chart. **Right-click the first or last dot** to remove it — the chart instantly
rescales to fit what's left. A small **reset** button appears so you can undo
it. (Only the end points can be trimmed, so you never punch holes in the middle.)

---

## Step 4 — Change how the total is built (optional)

The **Change mode** dropdown changes the *rule* for the running total itself.
The current mode is shown in the middle of the toolbar and ticked in the menu.
Changing it recomputes everything (no need to reload your file).

- **Default increment** — add up the digits as they are. (The normal case.)
- **Quadratic increment** — add up the *squares* of the digits.
- **Increment of every 2nd** — only add every second digit.

Pick one *before or after* loading data; your choice sticks.

---

## Step 5 — Edit a number by hand (optional)

Want to see what happens if one digit were different?

1. **Click the raw-digits panel** (the row of digits near the top).
2. A small window opens. **Type the index** (position id) of the element you
   want — any position in the data, not just the first ones — and click
   **Look up**.
3. Its current value appears. **Type a new value (0–9)** and click **Save**.
4. The app recomputes everything with that one change applied.

This is handy for sanity-checking: change a digit, watch the whole analysis
shift, and confirm the numbers respond the way you'd expect.

---

## Quick reference

| I want to… | Do this |
|------------|---------|
| Load my own digits | **Raw data → New data** |
| Rank numbers by best hits | Click the **exact%** header |
| Rank by closest average | Click the **avg\|diff\|** header |
| See one number's chart | **Click its row** |
| See its target-by-target detail | Click its row, look at the **Detailed** table |
| Remove a noisy point | **Right-click** the first/last dot on the chart |
| Undo a trimmed point | Click **reset** under the chart |
| Show fewer rows | **hide members** |
| Change the running-total rule | **Change mode** dropdown |
| Edit a single digit | **Click the raw-digits panel**, look up an index, save |

---

## What a "good" result looks like

There's a subtle but important takeaway baked into the design: for genuinely
random-looking digits, **almost every number behaves the same**. The exact-hit
rate hovers near ~22% and the average distance near ~1.5, across the board. So:

- If you sort the table and everything clusters tightly — that's normal and
  expected. It means the digits are behaving randomly and no number is special.
- If one number stuck out *dramatically* from the rest, *that* would be the
  surprise worth investigating — but with real random digits, you generally
  won't see it.

In other words, the app is built to help you tell the difference between *real*
structure and the *appearance* of structure. Most of the time, the honest answer
it gives is "nothing special here" — and recognizing that is exactly what it's
for.
