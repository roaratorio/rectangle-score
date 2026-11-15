// Drawing. Given the score and a time, paint the whole screen.
// Nothing in here changes the score or keeps time.
(function () {
  const RS = (globalThis.RS = globalThis.RS || {});

  RS.themes = {
    light: {
      bg: '#ffffff', ink: '#32323c', faint: '#9a9aa8', line: '#969696',
      hit: '#46588C', hitOn: '#BBB8BF', accent: '#B5533C', band: 'rgba(70,88,140,0.13)',
      played: 'rgba(0,0,0,0.05)',
    },
    dark: {
      bg: '#12131a', ink: '#d9d7df', faint: '#77768a', line: '#8d8d9a',
      hit: '#6f83c4', hitOn: '#eceaf2', accent: '#E58D6E', band: 'rgba(111,131,196,0.2)',
      played: 'rgba(255,255,255,0.06)',
    },
  };

  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const CLEF_FONT = '"Apple Symbols", "Noto Music", "Segoe UI Symbol", serif';
  const PITCH_FADE = 1.5;     // seconds for a pitch change to cross-fade
  const PITCH_PREVIEW = 15;   // seconds of warning before a pitch change

  const SILENCE_FADE = 1.5;   // seconds for the rows to fade out of, and back into, view
  const SILENCE_WARN = 10;    // seconds of warning before a silence

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // The rows come back a little before a silence ends, so the first notes
  // can be seen approaching.
  const silenceLead = (w) => Math.min(8, (w.end - w.start) / 2);

  function rowsAlpha(w, t) {
    if (!w) return 1;
    const out = 1 - (t - w.start) / SILENCE_FADE;
    const back = (t - (w.end - silenceLead(w))) / SILENCE_FADE;
    return clamp(Math.max(out, back), 0, 1);
  }

  const countdown = (s) => (s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s));

  RS.formatTime = function (t) {
    const s = Math.max(0, Math.floor(t));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  // Where everything sits for a given window size.
  // fitCells: in loop view, the longest cycle in the piece, so that it fits.
  RS.layout = function (W, H, nRows, fitCells) {
    const top = Math.max(60, H * 0.1);
    const tlH = clamp(H * 0.12, 60, 110);
    const bottom = H - tlH - 18;
    const rowH = (bottom - top) / nRows;
    const panelW = clamp(W * 0.15, 130, 240); // pitch notation column
    let size = Math.min(rowH * 0.42, W * 0.055);
    if (fitCells) size = Math.max(12, Math.min(size, (W - panelW - 30) / (fitCells + 1.9) / 1.25));
    const gap = size * 0.25;
    const pitch = size + gap;                 // distance from one cell to the next
    const lineX = panelW + pitch * 1.9;
    const tl = { x: 30, y: H - tlH, w: W - 60, h: tlH - 26 };
    return { W, H, top, bottom, rowH, size, gap, pitch, panelW, lineX, tl };
  };

  // --- Pitch notation -------------------------------------------------------

  const LETTERS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  function parseNote(name) {
    const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
    if (!m) return null;
    return { step: LETTERS[m[1]] + 7 * parseInt(m[3], 10), acc: m[2] || '', letter: m[1] };
  }

  function chordLabel(chord) {
    return chord.map((n) => {
      const p = parseNote(n);
      return p ? p.letter + (p.acc === 'b' ? '♭' : p.acc === '#' ? '♯' : '') : n;
    }).join('  ');
  }

  let clefMetrics = null;
  function drawClef(ctx, x, yMid, sp) {
    if (!clefMetrics) {
      ctx.font = '100px ' + CLEF_FONT;
      const m = ctx.measureText('𝄞');
      clefMetrics = { asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
    }
    const h = clefMetrics.asc + clefMetrics.desc;
    if (!(h > 0)) return;
    const scale = (sp * 7.2) / h;           // clef is a little taller than the staff
    ctx.font = 100 * scale + 'px ' + CLEF_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('𝄞', x, yMid - sp * 3.55 + clefMetrics.asc * scale);
  }

  // Filled stemless noteheads on a treble staff (E4 is the bottom line).
  function drawChord(ctx, chord, xCol, yMid, sp, alpha) {
    if (alpha <= 0) return;
    const notes = chord.map(parseNote).filter(Boolean).sort((a, b) => a.step - b.step);
    const yOf = (step) => yMid + 2 * sp - (step - 30) * sp / 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    let prevStep = -99, prevShifted = false;
    notes.forEach((n) => {
      const shifted = n.step - prevStep === 1 && !prevShifted; // seconds sit side by side
      const x = xCol + (shifted ? sp * 1.25 : 0);
      const y = yOf(n.step);
      // Ledger lines below and above the staff.
      ctx.lineWidth = Math.max(1, sp * 0.13);
      for (let s = 28; s >= n.step; s -= 2) line(ctx, x - sp * 1.1, yOf(s), x + sp * 1.1, yOf(s));
      for (let s = 40; s <= n.step; s += 2) line(ctx, x - sp * 1.1, yOf(s), x + sp * 1.1, yOf(s));
      ctx.beginPath();
      ctx.ellipse(x, y, sp * 0.68, sp * 0.47, -0.35, 0, Math.PI * 2);
      ctx.fill();
      if (n.acc) {
        ctx.font = sp * 2.5 + 'px ' + CLEF_FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.acc === 'b' ? '♭' : '♯', xCol - sp * 0.95, y - (n.acc === 'b' ? sp * 0.3 : 0));
      }
      prevStep = n.step;
      prevShifted = shifted;
    });
    ctx.restore();
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawPitchPanel(ctx, L, th, row, y, t) {
    const sp = clamp(L.rowH * 0.05, 5, 11);
    const staffW = Math.min(L.panelW - 36, sp * 13);
    const x0 = (L.panelW - staffW) / 2 + 8;

    ctx.fillStyle = th.faint;
    ctx.font = clamp(L.rowH * 0.075, 11, 17) + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(row.name.toUpperCase(), x0, y - sp * 4.6);

    ctx.strokeStyle = th.ink;
    ctx.fillStyle = th.ink;
    ctx.lineWidth = Math.max(1, sp * 0.13);
    for (let i = -2; i <= 2; i++) line(ctx, x0, y + i * sp, x0 + staffW, y + i * sp);
    drawClef(ctx, x0 + sp * 0.2, y, sp);

    // Which chord is current, and is one fading in?
    const tlp = row.pitchTimeline;
    let j = 0;
    while (j + 1 < tlp.length && tlp[j + 1].t <= t) j++;
    const p = j > 0 ? clamp((t - tlp[j].t) / PITCH_FADE, 0, 1) : 1;
    const xCol = x0 + staffW * 0.66;
    ctx.fillStyle = th.ink;
    ctx.strokeStyle = th.ink;
    if (p < 1) drawChord(ctx, tlp[j - 1].chord, xCol, y, sp, 1 - p);
    drawChord(ctx, tlp[j].chord, xCol, y, sp, p);

    // Note names, and a warning of the next change.
    const nameSize = clamp(L.rowH * 0.085, 12, 20);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + nameSize + 'px ' + FONT;
    ctx.fillStyle = th.ink;
    const label = chordLabel(p < 0.5 && j > 0 ? tlp[j - 1].chord : tlp[j].chord);
    const nameY = y + sp * 5.4 + nameSize * 0.4;
    ctx.fillText(label, x0, nameY);

    const next = tlp[j + 1];
    if (next && next.t - t < PITCH_PREVIEW) {
      const remaining = next.t - t;
      ctx.globalAlpha = clamp((PITCH_PREVIEW - remaining) / 2, 0, 1);
      ctx.fillStyle = th.accent;
      ctx.font = nameSize * 0.85 + 'px ' + FONT;
      const w = ctx.measureText(label).width;
      ctx.fillText('→ ' + chordLabel(next.chord) + '   ' + Math.ceil(remaining) + 's', x0 + w + nameSize * 0.7, nameY);
      ctx.globalAlpha = 1;
    }
  }

  // --- Rows of cells --------------------------------------------------------

  function findCycle(cycles, cell) {
    let lo = 0, hi = cycles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cycles[mid].cell <= cell) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function drawRow(ctx, L, th, row, y, t, loop, fade) {
    if (fade <= 0) return;
    const phase = row.curve.phaseAt(t);
    const onWidth = L.size / L.pitch;   // a cell is "on the line" for its own width
    if (!row.cycles.length) return;
    let kMin, kMax, tail = -1;
    if (loop) {
      // Show exactly as many cells as the cycle now at the line has. A cell
      // that has passed the line reappears at the back of the row, as the
      // matching cell of the cycle to come.
      kMin = Math.max(0, Math.floor(phase));
      if (kMin > row.totalCells - 1) return;
      tail = kMin + row.cycles[findCycle(row.cycles, kMin)].n - 1;
      kMax = Math.min(row.totalCells - 1, tail);
    } else {
      kMin = Math.max(0, Math.floor(phase - 1.7));
      kMax = Math.min(row.totalCells - 1, Math.ceil(phase + (L.W - L.lineX) / L.pitch));
    }
    if (kMax < kMin) return;
    const yTop = y - L.size / 2;
    let ci = findCycle(row.cycles, kMin);

    for (let k = kMin; k <= kMax; k++) {
      while (ci + 1 < row.cycles.length && row.cycles[ci + 1].cell <= k) ci++;
      const cyc = row.cycles[ci];
      const idx = k - cyc.cell;
      const isHit = cyc.pattern[idx];
      const past = phase - k;                       // cells travelled beyond the line
      const x = L.lineX - past * L.pitch;
      const on = past >= 0 && past <= onWidth;
      let alpha;
      if (loop) {
        // The leaving cell fades out as the cell joining the back fades in.
        alpha = past > 0.75 ? clamp(1 - (past - 0.75) / 0.25, 0, 1) : 1;
        if (k === tail && phase >= 0) alpha *= clamp((phase - kMin) / 0.25, 0, 1);
      } else {
        alpha = past > 0.8 ? clamp(1 - (past - 0.8) / 0.8, 0, 1) : 1;
      }
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha * fade;

      // A tick marks the start of every cycle; a changed cycle is labelled.
      if (idx === 0) {
        const tx = x - L.gap / 2;
        ctx.strokeStyle = cyc.changed ? th.accent : th.faint;
        ctx.lineWidth = cyc.changed ? 2.5 : 1;
        line(ctx, tx, yTop - L.size * 0.32, tx, yTop - 3);
        if (cyc.changed) {
          ctx.fillStyle = th.accent;
          ctx.font = '600 ' + clamp(L.size * 0.3, 10, 18) + 'px ' + FONT;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(cyc.hits + ' / ' + cyc.n, tx + 5, yTop - L.size * 0.1);
        }
      }

      if (isHit) {
        ctx.fillStyle = on ? th.hitOn : th.hit;
        ctx.fillRect(x, yTop, L.size, L.size);
      }
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = on ? 2.5 : 1;
      ctx.strokeRect(x, yTop, L.size, L.size);
    }
    ctx.globalAlpha = 1;
  }

  // --- Timeline -------------------------------------------------------------

  function drawTimeline(ctx, L, th, score, t, ui) {
    const tl = L.tl;
    const xOf = (time) => tl.x + tl.w * clamp(time / score.duration, 0, 1);

    // Sync windows as bands, with their glide-in shown lighter.
    ctx.fillStyle = th.band;
    score.syncWindows.forEach((w) => {
      ctx.fillRect(xOf(w.start), tl.y, xOf(w.end) - xOf(w.start), tl.h);
    });
    // Silences as grey blocks.
    ctx.fillStyle = th.faint;
    ctx.globalAlpha = 0.4;
    score.silences.forEach((w) => {
      ctx.fillRect(xOf(w.start), tl.y, xOf(w.end) - xOf(w.start), tl.h);
    });
    // A single row's rests as a thin strip along the bottom, one level per row.
    score.rows.forEach((row, i) => {
      row.tacets.forEach((w) => {
        ctx.fillRect(xOf(w.start), tl.y + tl.h - (score.rows.length - i) * 5, Math.max(2, xOf(w.end) - xOf(w.start)), 4);
      });
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = th.played;
    ctx.fillRect(tl.x, tl.y, xOf(t) - tl.x, tl.h);

    // Each row's tempo across the piece.
    const [lo, hi] = score.tempoRange;
    const yOf = (bpm) => tl.y + tl.h - 4 - (tl.h - 8) * (bpm - lo) / Math.max(1e-6, hi - lo);
    const steps = Math.max(60, Math.floor(tl.w / 3));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.font = '11px ' + FONT;
    score.rows.forEach((row, i) => {
      ctx.strokeStyle = th.hit;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([[], [6, 3], [2, 3]][i % 3]);
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const time = score.duration * s / steps;
        const px = tl.x + tl.w * s / steps, py = yOf(row.curve.valueAt(time) * 60);
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = th.faint;
      ctx.fillText(String(i + 1), tl.x - 6, yOf(row.curve.valueAt(0) * 60));
      // Pitch changes as small ticks along the top.
      ctx.fillStyle = th.ink;
      row.pitchTimeline.slice(1).forEach((p) => ctx.fillRect(xOf(p.t) - 0.5, tl.y + i * 4, 1.5, 4));
    });

    ctx.strokeStyle = th.faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x, tl.y, tl.w, tl.h);

    // Minute labels.
    const minutes = score.duration / 60;
    const every = minutes <= 6 ? 1 : minutes <= 14 ? 2 : 5;
    ctx.fillStyle = th.faint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let m = 0; m <= minutes; m += every) {
      const px = xOf(m * 60);
      line(ctx, px, tl.y + tl.h, px, tl.y + tl.h + 4);
      ctx.fillText(m + "'", px, tl.y + tl.h + 6);
    }

    // Hover position and playhead.
    if (ui.hoverT !== null && ui.hoverT !== undefined) {
      ctx.strokeStyle = th.faint;
      line(ctx, xOf(ui.hoverT), tl.y, xOf(ui.hoverT), tl.y + tl.h);
      ctx.fillStyle = th.ink;
      ctx.textBaseline = 'bottom';
      ctx.fillText(RS.formatTime(ui.hoverT), clamp(xOf(ui.hoverT), tl.x + 16, tl.x + tl.w - 16), tl.y - 3);
    }
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 2.5;
    line(ctx, xOf(t), tl.y - 3, xOf(t), tl.y + tl.h + 3);
  }

  // --- The whole frame ------------------------------------------------------

  RS.draw = function (ctx, W, H, score, t, ui) {
    const th = RS.themes[ui.theme] || RS.themes.light;
    const loop = score.view === 'loop';
    const L = RS.layout(W, H, score.rows.length, loop ? score.maxCells : 0);

    ctx.globalAlpha = 1;
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    const silence = score.silences.find((w) => t >= w.start && t < w.end);
    const fade = rowsAlpha(silence, t);
    const labelSize = clamp(H * 0.02, 12, 18);

    score.rows.forEach((row, i) => {
      const y = L.top + (i + 0.5) * L.rowH;
      // A row's own rest may run on from, or into, a silence for everyone.
      const rest = row.rests.find((w) => t >= w.start && t < w.end);
      const rowFade = rowsAlpha(rest, t);
      drawRow(ctx, L, th, row, y, t, loop, rowFade);
      if (rest && !silence) {
        // This row alone is resting: its own countdown, in its own row.
        const big = Math.min(L.rowH * 0.5, W * 0.1);
        const cx = L.lineX + L.pitch * 2.2;
        ctx.globalAlpha = 0.18 + 0.62 * (1 - rowFade);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = th.ink;
        ctx.font = '200 ' + big + 'px ' + FONT;
        const text = countdown(Math.ceil(rest.end - t));
        ctx.fillText(text, cx, y);
        const w = ctx.measureText(text).width;
        ctx.fillStyle = th.faint;
        ctx.font = '600 ' + clamp(big * 0.2, 11, 20) + 'px ' + FONT;
        ctx.fillText('TACET', cx + w + big * 0.25, y);
        ctx.globalAlpha = 1;
      }
      const tacetNext = !rest && row.tacets.find((w) => t >= w.start - SILENCE_WARN && t < w.start);
      const everyoneNext = score.silences.some((w) => t >= w.start - SILENCE_WARN && t < w.start);
      if (tacetNext && !everyoneNext) {
        ctx.fillStyle = th.accent;
        ctx.font = '600 ' + labelSize + 'px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('TACET IN ' + Math.ceil(tacetNext.start - t), L.lineX + L.pitch, y - L.size / 2 - L.size * 0.4);
      }
      drawPitchPanel(ctx, L, th, row, y, t);
    });

    // The line. It takes the accent colour while the rows are in sync.
    const inSync = score.syncWindows.some((w) => t >= w.start && t <= w.end);
    const converging = score.syncWindows.find((w) => t >= w.start - score.syncRamp && t < w.start);
    ctx.strokeStyle = inSync ? th.accent : th.line;
    ctx.lineWidth = clamp(L.size * 0.11, 3, 6);
    line(ctx, L.lineX, L.top - 6, L.lineX, L.bottom + 6);
    const silenceNext = score.silences.find((w) => t >= w.start - SILENCE_WARN && t < w.start);
    if (silenceNext) {
      ctx.fillStyle = th.accent;
      ctx.font = '600 ' + clamp(H * 0.02, 12, 18) + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('SILENCE IN ' + Math.ceil(silenceNext.start - t), L.lineX + L.pitch, L.top - 12);
    }
    if (silence) {
      // A countdown to the next note. It steps back once the rows return.
      const cx = (L.lineX + W) / 2, cy = (L.top + L.bottom) / 2;
      const big = Math.min((L.bottom - L.top) * 0.36, W * 0.16);
      ctx.globalAlpha = 0.18 + 0.62 * (1 - fade);
      ctx.fillStyle = th.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '200 ' + big + 'px ' + FONT;
      ctx.fillText(countdown(Math.ceil(silence.end - t)), cx, cy);
      ctx.fillStyle = th.faint;
      ctx.font = '600 ' + clamp(big * 0.13, 12, 26) + 'px ' + FONT;
      ctx.fillText('SILENCE', cx, cy - big * 0.68);
      ctx.globalAlpha = 1;
    }
    if (inSync || converging) {
      ctx.fillStyle = th.accent;
      ctx.font = '600 ' + clamp(H * 0.02, 12, 18) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(inSync ? 'IN SYNC' : 'CONVERGING', L.lineX, L.top - 12);
    }

    // Clock.
    ctx.fillStyle = th.ink;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const clockSize = clamp(H * 0.05, 22, 44);
    ctx.font = '300 ' + clockSize + 'px ' + FONT;
    ctx.fillText(RS.formatTime(t), W - 30, 16);
    ctx.fillStyle = th.faint;
    ctx.font = clockSize * 0.4 + 'px ' + FONT;
    ctx.fillText('of ' + RS.formatTime(score.duration) + '   ·   seed ' + score.seed, W - 30, 20 + clockSize);

    drawTimeline(ctx, L, th, score, t, ui);

    // Count-in before the cue point.
    if (t < ui.cue) {
      const n = Math.ceil(ui.cue - t);
      ctx.fillStyle = th.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.22; // a large watermark behind the cells
      ctx.font = '200 ' + (L.bottom - L.top) * 0.7 + 'px ' + FONT;
      ctx.fillText(String(n), (L.lineX + W) / 2, (L.top + L.bottom) / 2);
      ctx.globalAlpha = 1;
    }

    if (!ui.playing) {
      ctx.fillStyle = th.faint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = clamp(H * 0.022, 13, 18) + 'px ' + FONT;
      const msg = t >= score.duration ? 'End  ·  press Home to return to the start'
        : 'Paused  ·  press Space to play';
      ctx.fillText(msg, W / 2, L.tl.y - 22);
    }
  };
})();
