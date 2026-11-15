# Rectangle Score

An animated score for ensemble. Each row is one instrument. Rectangles travel
towards a vertical line; when a filled rectangle reaches the line, that player
plays a note from the pitches shown at the left of the row. Rows move at
different, changing tempi, which makes layered rhythms playable that would be
very hard to read from conventional notation.

## Running it

Open `index.html` in a browser. There is nothing to install or build.

| Key | Action |
|---|---|
| Space | Play / pause |
| ← → | Jump 10 seconds (with Shift: 1 minute) |
| Home or 0 | Back to the start, with a count-in |
| S | Setup |
| F | Fullscreen |
| D | Light / dark |

Click the timeline at the bottom to cue from that point.

## Setup

Everything about a piece is set in the Setup panel and takes effect at once.

- **Preset**: a ready-made piece to start from.
- **Seed**: the same seed always gives the same piece; a new seed gives a new version.
- **Tempo ratios**: steady tempi in a ratio such as 4:5:6 or 7:9:11.
- **Sync sections**: passages where all rows glide onto one row's tempo and align.
- **Silences**: passages where nobody plays, with a countdown to the return.
- **Pitch changes**: time spans in which each row moves to its next pitches.
- **Rows**: instrument, cycle length, rhythm, tempo shape, pattern changes,
  pitches, and tacet passages for that row alone.

Rhythms available per row: Euclidean, named rhythms (claves, bell patterns,
aksak groupings, or your own written as `x..x..x.` or `3+3+2`), seeded random,
additive build-up, Fibonacci word, Thue-Morse, and tiling canons shared
between rows.

Times are written `m:ss`. Sections are written `start +length`, for example
`5:00 +1:30`.

Pieces are saved in the browser you are using. To move a piece to another
computer, use **Export file** or **Copy link** in Setup.

## Mock-up output

For hearing a piece while working on it: built-in sound, MIDI (Chrome or
Edge; row 1 on channel 1, row 2 on channel 2, …) and OSC through a
WebSocket bridge (`/gate/1`, `/gate/2`, …; default `ws://localhost:8080`).

## Files

| File | Purpose |
|---|---|
| `js/engine.js` | Builds the whole score from the settings and the seed |
| `js/tempo.js` | Tempo curves and exact timing |
| `js/presets.js` | The ready-made pieces |
| `js/view.js` | Drawing |
| `js/setup.js` | The Setup panel |
| `js/output.js` | Sound, MIDI and OSC |
| `js/main.js` | Clock, transport and keyboard |
| `js/rng.js` | Seeded random numbers |
