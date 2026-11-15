// The score engine: config + seed -> the complete piece.
//
// Nothing here draws or keeps time. buildScore() returns, for every row, its
// tempo curve, every cycle of cells from start to finish, the time of every
// note, and its pitch changes. The view then just asks "what is at time t?".
(function () {
  const RS = (globalThis.RS = globalThis.RS || {});

  // Even spread of `hits` over `n` cells (same formula as the original sketch),
  // optionally rotated.
  RS.euclid = function (n, hits, rotation) {
    hits = Math.min(Math.max(hits, 0), n);
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = (i + (rotation || 0)) % n;
      out.push((j * hits) % n < hits);
    }
    return out;
  };

  // --- Rhythm generators -----------------------------------------------------
  //
  // Each returns the cells of one cycle (true = a note). `c` is the number of
  // the cycle within the row, `cell` the number of its first cell.

  // Fibonacci word: never repeats, notes are always 2 or 3 cells apart.
  const PHI = (1 + Math.sqrt(5)) / 2;
  const fibonacciHit = (k) => 2 + Math.floor((k + 2) * PHI) - Math.floor((k + 3) * PHI) === 1;

  // Thue-Morse sequence: never repeats, never plays the same figure three times running.
  const thueMorseHit = (k) => {
    let bits = 0;
    for (let x = k; x; x = Math.floor(x / 2)) bits += x % 2;
    return bits % 2 === 0;
  };

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }

  // A rhythmic tiling canon: every voice plays the same rhythm, each starting
  // at a different point, so that every cell is played by exactly one voice.
  // The cycle has runs * groups * voices cells.
  function buildTiling(spec, voices, rng) {
    const runs = Math.max(1, Math.round(spec.runs || 2));
    const groups = Math.max(1, Math.round(spec.groups || 2));
    const N = runs * groups * voices;
    const units = [];
    for (let u = 1; u < N; u++) if (gcd(u, N) === 1) units.push(u);
    let mult = Math.round(spec.variant || 0);
    if (!units.includes(mult)) mult = units.length ? units[Math.floor(rng() * units.length)] : 1;
    const motif = new Set();
    for (let i = 0; i < runs; i++) {
      for (let j = 0; j < groups; j++) motif.add(((i + j * voices * runs) * mult) % N);
    }
    const patterns = [];
    for (let v = 0; v < voices; v++) {
      const offset = (runs * v * mult) % N;
      const p = [];
      for (let x = 0; x < N; x++) p.push(motif.has((x - offset + N) % N));
      patterns.push(p);
    }
    return { patterns, mult, N };
  }

  // --- Named rhythms ---------------------------------------------------------
  //
  // Written either cell by cell ("x..x..x.", x = a note) or as group lengths
  // with a note at the start of each group ("3+3+2").
  RS.parseRhythm = function (text) {
    text = String(text || '').trim();
    if (/^\d+(\s*\+\s*\d+)*$/.test(text)) {
      const out = [];
      text.split('+').forEach((g) => {
        const len = Math.min(parseInt(g, 10), 64);
        for (let j = 0; j < len; j++) out.push(j === 0);
      });
      return out.length && out.length <= 64 ? out : null;
    }
    const cells = text.replace(/[\s|]/g, '');
    if (!cells || cells.length > 64 || !/^[xX.\-_0o1]+$/.test(cells)) return null;
    return Array.from(cells, (ch) => /[xX1]/.test(ch));
  };

  RS.namedRhythms = [
    ['tresillo', 'Tresillo (8)', '3+3+2'],
    ['cinquillo', 'Cinquillo (8)', 'x.xx.xx.'],
    ['son-32', 'Son clave 3-2 (16)', 'x..x..x...x.x...'],
    ['son-23', 'Son clave 2-3 (16)', '..x.x...x..x..x.'],
    ['rumba-32', 'Rumba clave 3-2 (16)', 'x..x...x..x.x...'],
    ['bossa', 'Bossa nova clave (16)', 'x..x..x...x..x..'],
    ['shiko', 'Shiko (16)', 'x...x.x...x.x...'],
    ['soukous', 'Soukous (16)', 'x..x..x...xx....'],
    ['gahu', 'Gahu (16)', 'x..x..x...x...x.'],
    ['bell-12', 'Standard bell pattern / bembé (12)', '2+2+1+2+2+2+1'],
    ['fume-fume', 'Fume-fume bell (12)', '2+2+3+2+3'],
    ['clapping', 'Clapping Music, Reich (12)', 'xxx.xx.x.xx.'],
    ['aksak-23', 'Aksak 2+3 · paidushko (5)', '2+3'],
    ['aksak-223', 'Aksak 2+2+3 · rŭchenitsa (7)', '2+2+3'],
    ['aksak-322', 'Aksak 3+2+2 · lesnoto (7)', '3+2+2'],
    ['aksak-2223', 'Aksak 2+2+2+3 · daichovo (9)', '2+2+2+3'],
    ['aksak-22322', 'Aksak 2+2+3+2+2 · kopanitsa (11)', '2+2+3+2+2'],
  ];

  function namedPattern(spec) {
    if (spec.name === 'custom') return RS.parseRhythm(spec.custom);
    const entry = RS.namedRhythms.find((e) => e[0] === spec.name) || RS.namedRhythms[0];
    return RS.parseRhythm(entry[2]);
  }

  function makePattern(r, rowIndex, state, c, cell, seed, tiling) {
    const spec = r.pattern || { type: 'euclid' };
    const n = state.n, h = state.h;
    const shift = spec.shiftEvery > 0 ? Math.floor(c / spec.shiftEvery) : 0;
    const rot = (((r.rotation || 0) + shift) % n + n) % n;

    switch (spec.type) {
      case 'tiling':
        if (tiling && tiling.byRow[rowIndex]) return { pattern: tiling.byRow[rowIndex], key: 'tiling' };
        break;
      case 'named': {
        // A fixed pattern; its own length sets the cycle.
        const base = namedPattern(spec);
        if (!base) break;
        const len = base.length;
        const turn = (((r.rotation || 0) + shift) % len + len) % len;
        return { pattern: base.map((_, j) => base[(j + turn) % len]), key: 'named:' + base.map((b) => (b ? 'x' : '.')).join('') + ':' + turn };
      }
      case 'fibonacci':
      case 'thue-morse': {
        const hit = spec.type === 'fibonacci' ? fibonacciHit : thueMorseHit;
        const pattern = [];
        for (let j = 0; j < n; j++) pattern.push(hit(cell + j));
        return { pattern, key: 'word:' + n };
      }
      case 'random': {
        const draw = spec.redrawEvery > 0 ? Math.floor(c / spec.redrawEvery) : 0;
        const key = 'random:' + n + ':' + h + ':' + draw;
        const rng = RS.makeRng(seed, 'pattern/' + rowIndex + '/' + key);
        const order = Array.from({ length: n }, (_, j) => j);
        for (let j = n - 1; j > 0; j--) {
          const k = Math.floor(rng() * (j + 1));
          [order[j], order[k]] = [order[k], order[j]];
        }
        const pattern = new Array(n).fill(false);
        order.slice(0, Math.min(h, n)).forEach((j) => { pattern[j] = true; });
        return { pattern, key };
      }
      case 'additive': {
        // Reveal the pattern a cell at a time, then take it away again.
        const full = RS.euclid(n, h, rot);
        if (n < 2) return { pattern: full, key: 'add:1' };
        const stage = Math.floor(c / Math.max(1, spec.repeat || 2)) % (2 * n - 2);
        const len = stage < n ? stage + 1 : 2 * n - 1 - stage;
        return { pattern: full.slice(0, len), key: 'add:' + n + ':' + h + ':' + len };
      }
    }
    return { pattern: RS.euclid(n, h, rot), key: n + ':' + h + ':' + rot };
  }

  // "2 +h, 10 +n, 15 -h"  ->  [{t: 2, op: '+h'}, ...]   (times in seconds)
  // +n / -n add or remove a cell; +h / -h add or remove a note.
  function parseForm(text, scale) {
    if (!text) return [];
    return text.split(',').map((part) => {
      const [time, op] = part.trim().split(/\s+/);
      return { t: parseFloat(time) * (scale || 1), op };
    }).filter((c) => isFinite(c.t) && /^[+-][nh]$/.test(c.op || ''))
      .sort((a, b) => a.t - b.t);
  }

  function applyOp(state, op) {
    if (op === '+n') state.n++;
    else if (op === '-n') { if (state.n > 1) state.n--; }
    else if (op === '+h') state.h++;
    else if (op === '-h') { if (state.h > state.minHits) state.h--; }
  }

  // A seeded random form: every so often, add or remove a cell or a note,
  // staying inside the given ranges.
  //   gen: { every: [minSeconds, maxSeconds], cells: [min, max], hits: [min, max] }
  function generateForm(gen, row, duration, rng) {
    const every = gen.every || [20, 60];
    const cells = gen.cells || [3, 9];
    const hits = gen.hits || [1, 5];
    const out = [];
    let n = row.cells, h = row.hits;
    let t = rng.between(every[0], every[1]) * 0.5;
    while (t < duration) {
      const options = [];
      if (n < cells[1]) options.push('+n');
      if (n > Math.max(1, cells[0])) options.push('-n');
      if (h < Math.min(hits[1], n)) options.push('+h');
      if (h > hits[0]) options.push('-h');
      if (!options.length) break;
      const op = options[Math.floor(rng() * options.length)];
      if (op === '+n') n++; else if (op === '-n') n--; else if (op === '+h') h++; else h--;
      out.push({ t, op });
      t += Math.max(1, rng.between(every[0], every[1]));
    }
    return out;
  }

  const frac = (x) => x - Math.floor(x);

  // Bend a row's own tempo curve so that it glides to the reference row's
  // tempo before each sync window, arrives with its cells exactly aligned,
  // follows the reference through the window, then glides back to its own curve.
  function applySync(ownPts, refCurve, windows, ramp) {
    const own = new RS.Curve(ownPts);
    const out = [];
    let cursor = 0; // index into ownPts
    let prevEnd = 0;

    windows.forEach((w, wi) => {
      const next = windows[wi + 1];
      const rampIn = Math.max(0.5, Math.min(ramp, (w.start - prevEnd) * 0.9));
      const rampOut = next ? Math.min(ramp, (next.start - w.end) / 2) : ramp;
      const t0 = w.start - rampIn;

      // Own curve up to the start of the glide.
      while (cursor < ownPts.length && ownPts[cursor].t < t0) out.push(ownPts[cursor++]);
      const a = own.valueAt(t0);
      out.push({ t: t0, v: a });

      // Glide in: a midpoint nudged up or down so the cells land aligned.
      const b = refCurve.valueAt(w.start);
      const phaseAtT0 = new RS.Curve(out).phaseAt(t0);
      const plainArrival = phaseAtT0 + rampIn * (a + b) / 2;
      let shift = frac(refCurve.phaseAt(w.start)) - frac(plainArrival);
      if (shift > 0.5) shift -= 1;
      if (shift <= -0.5) shift += 1;
      const mid = Math.max(0.02, (a + b) / 2 + (2 * shift) / rampIn);
      out.push({ t: t0 + rampIn / 2, v: mid });

      // Through the window: identical to the reference row.
      out.push({ t: w.start, v: b });
      refCurve.pts.forEach((p) => { if (p.t > w.start && p.t < w.end) out.push(p); });
      out.push({ t: w.end, v: refCurve.valueAt(w.end) });

      // Glide back out to the row's own tempo.
      const t1 = w.end + rampOut;
      out.push({ t: t1, v: own.valueAt(t1) });
      while (cursor < ownPts.length && ownPts[cursor].t <= t1) cursor++;
      prevEnd = t1;
    });

    while (cursor < ownPts.length) out.push(ownPts[cursor++]);
    return out;
  }

  RS.buildScore = function (config, seedOverride) {
    const seed = seedOverride || config.seed || 'score';
    const duration = config.duration;
    const sync = config.sync || { windows: [] };
    // Sync windows in order, inside the piece, and not overlapping.
    const windows = [];
    (sync.windows || [])
      .map(([start, dur]) => ({ start, end: Math.min(start + dur, duration) }))
      .filter((w) => w.start >= 2 && w.end > w.start && w.start < duration)
      .sort((a, b) => a.start - b.start)
      .forEach((w) => {
        const prev = windows[windows.length - 1];
        if (!prev || w.start > prev.end + 2) windows.push(w);
      });
    const ramp = Math.max(1, sync.ramp || 20);
    const refIndex = Math.min(sync.ref || 0, config.rows.length - 1);

    // Rows set to 'tiling' share one canon between them.
    const tilingRows = config.rows.map((r, i) => i).filter((i) => (config.rows[i].pattern || {}).type === 'tiling');
    let tiling = null;
    if (tilingRows.length) {
      tiling = buildTiling(config.tiling || {}, tilingRows.length, RS.makeRng(seed, 'tiling'));
      tiling.byRow = {};
      tilingRows.forEach((rowIndex, v) => { tiling.byRow[rowIndex] = tiling.patterns[v]; });
    }

    // Silences: the rows keep turning underneath, but nothing is played.
    // A row can also be silent on its own ("tacet") while the others play.
    const spans = (list) => (list || [])
      .map(([start, length]) => ({ start, end: Math.min(duration, start + length) }))
      .filter((w) => w.start >= 0 && w.end > w.start)
      .sort((a, b) => a.start - b.start);
    const merge = (list) => {
      const out = [];
      list.slice().sort((a, b) => a.start - b.start).forEach((w) => {
        const last = out[out.length - 1];
        if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
        else out.push({ start: w.start, end: w.end });
      });
      return out;
    };
    const silences = merge(spans(config.silences));

    const ownPts = config.rows.map((r) => RS.sampleTempo(r.tempo, duration));
    const refCurve = new RS.Curve(ownPts[refIndex]);

    let minBpm = Infinity, maxBpm = -Infinity;

    const rows = config.rows.map((r, i) => {
      const pts = (i === refIndex || !windows.length)
        ? ownPts[i]
        : applySync(ownPts[i], refCurve, windows, ramp);
      const curve = new RS.Curve(pts);
      const tacets = merge(spans(r.tacet));
      const rests = merge(silences.concat(tacets)); // every span in which this row does not play
      const silentAt = (time) => rests.some((w) => time >= w.start && time < w.end);
      pts.forEach((p) => {
        minBpm = Math.min(minBpm, p.v * 60);
        maxBpm = Math.max(maxBpm, p.v * 60);
      });

      // Cycles: pattern changes only ever take effect at the start of a cycle.
      const generated = r.formMode === 'generated';
      const changes = generated
        ? generateForm(r.gen || {}, r, duration, RS.makeRng(seed, 'form/' + i))
        : parseForm(r.form, r.formScale);
      const state = {
        n: Math.max(1, Math.round(r.cells) || 1),
        h: Math.max(0, Math.round(r.hits) || 0),
        minHits: generated ? ((r.gen && r.gen.hits) || [1])[0] : 1,
      };
      const cycles = [];
      const hits = [];
      let cell = 0, ci = 0, prevKey = '';
      while (true) {
        const t = curve.timeAt(cell);
        if (t >= duration) break;
        while (ci < changes.length && changes[ci].t <= t) applyOp(state, changes[ci++].op);
        const made = makePattern(r, i, state, cycles.length, cell, seed, tiling);
        const key = made.key, firstCell = cell;
        // Notes that would fall inside a silence become empty cells.
        const pattern = rests.length
          ? made.pattern.map((on, j) => on && !silentAt(curve.timeAt(firstCell + j)))
          : made.pattern;
        cycles.push({
          cell, t, n: pattern.length, hits: made.pattern.filter(Boolean).length, pattern,
          changed: cycles.length > 0 && key !== prevKey,
        });
        pattern.forEach((on, j) => {
          if (!on) return;
          const ht = curve.timeAt(cell + j);
          if (ht < duration) hits.push({ t: ht, cell: cell + j });
        });
        prevKey = key;
        cell += pattern.length;
      }

      // Pitch changes: one at a seeded random moment inside each window.
      const rng = RS.makeRng(seed, 'pitch/' + i);
      const pitches = r.pitches || [[]];
      const pitchTimeline = [{ t: -Infinity, chord: pitches[0] }];
      (config.pitchWindows || []).forEach(([from, to], j) => {
        const t = rng.between(from, to);
        if (pitches[j + 1]) pitchTimeline.push({ t, chord: pitches[j + 1] });
      });

      return { name: r.name, curve, cycles, hits, totalCells: cell, pitchTimeline, tacets, rests };
    });

    return {
      title: config.title, seed, duration, rows, syncWindows: windows, syncRamp: ramp, silences,
      tiling: tiling && { cells: tiling.N, variant: tiling.mult },
      // 'loop': each row shows one cycle's worth of cells, going round.
      // 'scroll': each row is a continuous stream to the edge of the screen.
      view: config.view === 'scroll' ? 'scroll' : 'loop',
      maxCells: Math.max(1, ...rows.map((r) => r.cycles.reduce((m, c) => Math.max(m, c.n), 1))),
      countIn: config.countIn === undefined ? 5 : config.countIn,
      tempoRange: [minBpm, maxBpm],
    };
  };
})();
