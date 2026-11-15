// Rectangle Score. © 2025–2026 Rob Casey.
// The setup panel: every parameter of the piece, editable, with the score
// rebuilt live behind it. It edits a plain config object (the same shape as
// the presets) and hands it to RS.app.applyConfig().
(function () {
  const RS = globalThis.RS;
  const panel = document.getElementById('setup');
  let config = null;
  let timer = null;

  // --- Small helpers --------------------------------------------------------

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== false) node.setAttribute(k, v);
    });
    kids.flat().forEach((kid) => {
      if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
    });
    return node;
  }

  const fmtTime = (s) => {
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  const parseTime = (str) => {
    const parts = String(str).trim().split(':');
    return parts.length === 2 ? parseInt(parts[0], 10) * 60 + parseFloat(parts[1]) : parseFloat(parts[0]);
  };

  function changed() {
    clearTimeout(timer);
    timer = setTimeout(apply, 200);
  }

  function apply() {
    const result = RS.app.applyConfig(config);
    const status = document.getElementById('setup-status');
    if (!status) return;
    status.className = result.ok ? '' : 'error';
    status.textContent = result.ok
      ? RS.app.score.rows.map((r, i) => (i + 1) + ': ' + r.cycles.length + ' cycles, ' + r.hits.length + ' notes').join('   ·   ')
      : 'Not applied: ' + result.error;
  }

  // A labelled field bound to obj[key].
  function field(label, obj, key, opts) {
    opts = opts || {};
    const input = el('input', {
      type: opts.type || 'text', min: opts.min, max: opts.max, step: opts.step,
      spellcheck: 'false', autocomplete: 'off',
    });
    const toText = opts.toText || ((v) => (v === undefined || v === null ? '' : String(v)));
    input.value = toText(obj[key]);
    input.addEventListener('input', () => {
      let v = input.value;
      if (opts.type === 'number') {
        v = parseFloat(v);
        if (!isFinite(v)) return;
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
      } else if (opts.parse) {
        v = opts.parse(v);
        if (v === undefined) return;
      }
      obj[key] = v;
      (opts.onChange || changed)();
    });
    return el('label', { class: 'field' + (opts.wide ? ' wide' : '') }, el('span', {}, label), input);
  }

  function select(label, value, options, onChange) {
    const s = el('select', {}, options.map(([v, text]) => el('option', { value: v }, text)));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return el('label', { class: 'field' }, el('span', {}, label), s);
  }

  // A [min, max] pair shown as two number boxes.
  function range(label, obj, key, defaults, opts) {
    if (!Array.isArray(obj[key])) obj[key] = defaults.slice();
    return el('div', { class: 'pair' },
      field(label + ' from', obj[key], 0, Object.assign({ type: 'number' }, opts)),
      field('to', obj[key], 1, Object.assign({ type: 'number' }, opts)));
  }

  // --- Text formats for lists ----------------------------------------------

  const windowsToText = (list) => (list || []).map(([s, d]) => fmtTime(s) + ' +' + fmtTime(d)).join(', ');
  const windowsFromText = (text) => text.split(',').map((part) => {
    const m = /^\s*([\d:.]+)\s*\+\s*([\d:.]+)\s*$/.exec(part);
    return m ? [parseTime(m[1]), parseTime(m[2])] : null;
  }).filter((w) => w && isFinite(w[0]) && isFinite(w[1]));

  const spansToText = (list) => (list || []).map(([a, b]) => fmtTime(a) + '-' + fmtTime(b)).join(', ');
  const spansFromText = (text) => text.split(',').map((part) => {
    const m = /^\s*([\d:.]+)\s*-\s*([\d:.]+)\s*$/.exec(part);
    return m ? [parseTime(m[1]), parseTime(m[2])] : null;
  }).filter((w) => w && isFinite(w[0]) && isFinite(w[1]) && w[1] >= w[0]);

  const pitchesToText = (list) => (list || []).map((chord) => chord.join(' ')).join(' | ');
  const pitchesFromText = (text) => {
    const chords = text.split('|').map((c) => c.trim().split(/\s+/).filter(Boolean)
      .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
      .filter((n) => /^[A-G](b|#)?-?\d$/.test(n)));
    return chords.length ? chords : [[]];
  };

  // --- Sections -------------------------------------------------------------

  function tempoFields(row) {
    const t = row.tempo;
    const bpm = { type: 'number', min: 1, max: 600, step: 0.1 };
    if (t.type === 'const') return [field('Cells per minute', t, 'bpm', bpm)];
    if (t.type === 'sine') {
      return [
        field('Centre (cells/min)', t, 'center', bpm),
        field('Depth ±', t, 'depth', { type: 'number', min: 0, max: 300, step: 0.1 }),
        field('Wave length', t, 'period', { toText: fmtTime, parse: (v) => { const s = parseTime(v); return s > 0 ? s : undefined; } }),
      ];
    }
    return [
      field('From (cells/min)', t, 'from', bpm),
      field('To', t, 'to', bpm),
      field('Starts at', t, 'start', { toText: fmtTime, parse: (v) => { const s = parseTime(v); return s >= 0 ? s : undefined; } }),
      field('Ends at', t, 'end', { toText: fmtTime, parse: (v) => { const s = parseTime(v); return s > 0 ? s : undefined; } }),
      select('Curve', t.shape || 'duration', [
        ['duration', 'Even change in cell length'],
        ['linear', 'Even change in tempo'],
        ['exp', 'Exponential'],
      ], (v) => { t.shape = v; changed(); }),
    ];
  }

  function startTempo(row) {
    const t = row.tempo;
    return t.type === 'const' ? t.bpm : t.type === 'sine' ? t.center : t.from;
  }

  function setTempoType(row, type) {
    const base = Math.round(startTempo(row) * 10) / 10 || 24;
    if (type === 'const') row.tempo = { type, bpm: base };
    else if (type === 'sine') row.tempo = { type, center: base, depth: Math.round(base * 5) / 10, period: config.duration };
    else row.tempo = { type, from: base, to: Math.round(base * 15) / 10, start: 0, end: config.duration, shape: 'duration' };
  }

  const RHYTHMS = [
    ['euclid', 'Euclidean (evenly spread)'],
    ['named', 'Named rhythm (clave, bell, aksak…)'],
    ['random', 'Random placement (seeded)'],
    ['additive', 'Build up and take apart'],
    ['fibonacci', 'Fibonacci word (never repeats)'],
    ['thue-morse', 'Thue-Morse (never repeats)'],
    ['tiling', 'Tiling canon (shared between rows)'],
  ];

  const RHYTHM_HINTS = {
    euclid: 'A Euclidean rhythm: notes are spread as evenly as possible over the cycle, e.g. 3 notes in 8 cells gives the tresillo, 5 in 8 the cinquillo.',
    named: 'A fixed, established rhythm. Its length sets the cycle, so "Cells", "Notes" and pattern changes are not used. "Rotate pattern" starts it from a different cell. Your own can be written cell by cell (x..x..x.) or as groups (3+3+2).',
    random: 'Notes are placed at random from the seed.',
    additive: 'The pattern appears one cell at a time, then is removed one cell at a time.',
    fibonacci: 'Notes fall 2 or 3 cells apart in a sequence that never repeats. "Notes in cycle" is not used.',
    'thue-morse': 'A sequence that never repeats and never states the same figure three times running. "Notes in cycle" is not used.',
    tiling: 'Rows set to this share one rhythm, offset so each cell is played by exactly one of them. Give them the same tempo. Cells, notes and pattern changes are set by the canon.',
  };

  function rhythmFields(row) {
    const p = row.pattern;
    const cycles = { type: 'number', min: 0, max: 999, step: 1, toText: (v) => String(v || 0) };
    if (p.type === 'euclid') return [field('Shift by one cell every … cycles (0 = never)', p, 'shiftEvery', cycles)];
    if (p.type === 'named') {
      if (!p.name) p.name = RS.namedRhythms[0][0];
      const own = p.name === 'custom';
      const shown = own ? RS.parseRhythm(p.custom) : RS.parseRhythm(RS.namedRhythms.find((e) => e[0] === p.name)[2]);
      return [
        select('Pattern', p.name, RS.namedRhythms.map(([id, text]) => [id, text]).concat([['custom', 'Your own…']]),
          (v) => {
            // Starting "your own" from the pattern just shown makes it easy to vary one.
            if (v === 'custom' && !p.custom && shown) p.custom = shown.map((b) => (b ? 'x' : '.')).join('');
            p.name = v; apply(); render();
          }),
        own && field('Your pattern', p, 'custom', { parse: (text) => (RS.parseRhythm(text) ? text : undefined) }),
        field('Shift by one cell every … cycles (0 = never)', p, 'shiftEvery', cycles),
        !own && shown && el('p', { class: 'hint wide mono' }, shown.map((b) => (b ? 'x' : '.')).join(' ')),
      ];
    }
    if (p.type === 'random') {
      return [
        field('New placement every … cycles (0 = never)', p, 'redrawEvery', cycles),
        field('Shift by one cell every … cycles', p, 'shiftEvery', cycles),
      ];
    }
    if (p.type === 'additive') {
      return [field('Cycles at each stage', p, 'repeat', { type: 'number', min: 1, max: 99, step: 1, toText: (v) => String(v || 2) })];
    }
    return [];
  }

  function rowCard(row, i) {
    if (!row.formMode) row.formMode = 'written';
    if (!row.pattern) row.pattern = { type: 'euclid' };
    const formFields = row.formMode === 'generated'
      ? (() => {
        row.gen = row.gen || {};
        return [
          range('A change every (s)', row.gen, 'every', [20, 60], { min: 1, max: 3600 }),
          range('Cells', row.gen, 'cells', [3, 9], { min: 1, max: 32, step: 1 }),
          range('Notes', row.gen, 'hits', [1, 5], { min: 0, max: 32, step: 1 }),
        ];
      })()
      : [
        el('label', { class: 'field wide' },
          el('span', {}, 'Changes: seconds then +n −n (cell) or +h −h (note)'),
          (() => {
            const ta = el('textarea', { rows: 3, spellcheck: 'false' });
            ta.value = row.form || '';
            ta.addEventListener('input', () => { row.form = ta.value.replace(/−/g, '-'); changed(); });
            return ta;
          })()),
        field('Stretch times ×', row, 'formScale', { type: 'number', min: 0.1, max: 10, step: 0.05, toText: (v) => String(v || 1) }),
      ];

    return el('section', { class: 'card' },
      el('div', { class: 'card-head' },
        el('strong', {}, 'Row ' + (i + 1)),
        config.rows.length > 1 && el('button', {
          class: 'link', onclick: () => { config.rows.splice(i, 1); render(); changed(); },
        }, 'Remove')),
      el('div', { class: 'grid' },
        field('Instrument', row, 'name'),
        field('Cells in cycle', row, 'cells', { type: 'number', min: 1, max: 32, step: 1 }),
        field('Notes in cycle', row, 'hits', { type: 'number', min: 0, max: 32, step: 1 }),
        field('Rotate pattern', row, 'rotation', { type: 'number', min: 0, max: 31, step: 1, toText: (v) => String(v || 0) })),
      el('div', { class: 'grid' },
        select('Rhythm', row.pattern.type, RHYTHMS,
          (v) => { row.pattern = { type: v }; apply(); render(); apply(); }),
        rhythmFields(row),
        el('p', { class: 'hint wide' }, RHYTHM_HINTS[row.pattern.type])),
      el('div', { class: 'grid' },
        select('Tempo', row.tempo.type, [['const', 'Steady'], ['sine', 'Wave'], ['ramp', 'Speeding up / slowing']],
          (v) => { setTempoType(row, v); render(); changed(); }),
        tempoFields(row)),
      el('div', { class: 'grid' },
        select('Pattern changes', row.formMode, [['written', 'Written out'], ['generated', 'Generated from seed']],
          (v) => { row.formMode = v; render(); changed(); }),
        formFields),
      el('div', { class: 'grid' },
        field('Pitches, in order ( | between changes)', row, 'pitches',
          { wide: true, toText: pitchesToText, parse: pitchesFromText }),
        field('Tacet: this row alone is silent (start +length, e.g. 6:00 +1:00)', row, 'tacet',
          { wide: true, toText: windowsToText, parse: windowsFromText })));
  }

  // Sound, MIDI and OSC for mock-ups. Stored on this computer, not in the piece.
  function outputCard() {
    const out = RS.output, s = out.settings;
    const update = () => { out.save(); out.prepare(); out.reset(); };
    const check = (label, key) => {
      const box = el('input', { type: 'checkbox' });
      box.checked = !!s[key];
      box.addEventListener('change', () => { s[key] = box.checked; update(); render(); });
      return el('label', { class: 'check' }, box, label);
    };
    const note = (text) => text && el('p', { class: 'hint wide' }, text);
    const outputs = out.midiOutputs();

    return el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, 'Mock-up output')),
      el('p', { class: 'hint' }, 'Hear the piece while you work on it. Row 1 plays on MIDI channel 1 and OSC /gate/1, row 2 on channel 2 and /gate/2, and so on. These settings stay on this computer.'),
      el('div', { class: 'grid' },
        check('Built-in sound', 'audio'),
        el('span', {}),
        check('MIDI', 'midi'),
        s.midi && outputs.length > 0
          ? select('Send to', (outputs.find((o) => o.name === s.midiOutput) || outputs[0]).name,
            outputs.map((o) => [o.name, o.name]), (v) => { s.midiOutput = v; update(); render(); })
          : el('span', {}),
        s.midi && note(out.status.midi),
        check('OSC', 'osc'),
        s.osc ? field('Bridge address', s, 'oscUrl', { onChange: () => out.save() }) : el('span', {}),
        s.osc && note(out.status.osc),
        select('Each note plays', s.notes, [['random', 'One note of the pitch set'], ['all', 'The whole pitch set']],
          (v) => { s.notes = v; update(); }),
        field('Note length (seconds)', s, 'length', { type: 'number', min: 0.05, max: 10, step: 0.05, onChange: () => out.save() })));
  }

  // Shown only when at least one row uses the tiling rhythm.
  function tilingCard() {
    const voices = config.rows.filter((r) => (r.pattern || {}).type === 'tiling').length;
    if (!voices) return null;
    config.tiling = config.tiling || { runs: 2, groups: 2, variant: 0 };
    const t = config.tiling;
    const info = RS.app.score.tiling;
    return el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, 'Tiling canon')),
      el('p', { class: 'hint' }, voices + (voices === 1 ? ' row uses' : ' rows use') + ' this rhythm. The cycle has '
        + 'notes together × groups × rows = ' + (Math.round(t.runs || 2) * Math.round(t.groups || 2) * voices) + ' cells.'
        + (info ? ' Current variant: ' + info.variant + '.' : '')),
      el('div', { class: 'grid' },
        field('Notes together', t, 'runs', { type: 'number', min: 1, max: 6, step: 1 }),
        field('Groups per cycle', t, 'groups', { type: 'number', min: 1, max: 6, step: 1 }),
        field('Variant (0 = chosen by seed)', t, 'variant', { type: 'number', min: 0, max: 200, step: 1, wide: true, toText: (v) => String(v || 0) })));
  }

  function ratioTool() {
    const state = { ratios: config.rows.map((r) => Math.round(startTempo(r))).join(':'), base: 5 };
    // Suggest the simplest form of the current tempi.
    const nums = state.ratios.split(':').map(Number);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = nums.reduce(gcd);
    if (g > 1) { state.ratios = nums.map((n) => n / g).join(':'); state.base = g; }
    else { state.ratios = ['4:5', '4:5:6', '4:5:6:7'][config.rows.length - 2] || state.ratios; state.base = 5; }

    return el('div', { class: 'grid' },
      field('Ratios', state, 'ratios'),
      field('× cells/min', state, 'base', { type: 'number', min: 0.5, max: 200, step: 0.5 }),
      el('button', {
        class: 'tool', onclick: () => {
          const parts = state.ratios.split(/[:\s,]+/).map(parseFloat).filter((n) => n > 0);
          if (!parts.length) return;
          clearTimeout(timer);
          while (config.rows.length > parts.length) config.rows.pop();
          while (config.rows.length < parts.length) addRow();
          parts.forEach((p, i) => { config.rows[i].tempo = { type: 'const', bpm: Math.round(p * state.base * 100) / 100 }; });
          render();
          apply();
        },
      }, 'Set steady tempi'));
  }

  function addRow() {
    const last = config.rows[config.rows.length - 1];
    const copy = JSON.parse(JSON.stringify(last));
    copy.name = 'Row ' + (config.rows.length + 1);
    config.rows.push(copy);
  }

  function render() {
    const scroll = panel.scrollTop;
    const presetOptions = [['', 'Load a preset…']].concat(Object.keys(RS.presets).map((k) => [k, RS.presets[k].title]));
    config.sync = config.sync || { ref: 0, ramp: 20, windows: [] };

    panel.replaceChildren(
      el('div', { class: 'setup-head' },
        el('h2', {}, 'Setup'),
        el('button', { class: 'link', onclick: () => RS.setup.close() }, 'Close')),

      el('section', { class: 'card' },
        el('div', { class: 'grid' },
          select('Preset', '', presetOptions, (key) => {
            if (!key) return;
            config = JSON.parse(JSON.stringify(RS.presets[key]));
            render();
            apply();
          }),
          field('Title', config, 'title'),
          minutesField(),
          field('Count-in (seconds)', config, 'countIn', { type: 'number', min: 0, max: 30, step: 1 }),
          select('Rows shown as', config.view === 'scroll' ? 'scroll' : 'loop',
            [['loop', 'Loops (one cycle each)'], ['scroll', 'Continuous scroll']],
            (v) => { config.view = v; changed(); }),
          field('Seed', config, 'seed'),
          el('button', { class: 'tool', onclick: () => { config.seed = RS.randomSeed(); render(); apply(); } }, 'New seed'))),

      outputCard(),

      el('section', { class: 'card' },
        el('div', { class: 'card-head' }, el('strong', {}, 'Tempo ratios')),
        el('p', { class: 'hint' }, 'Give every row a steady tempo in a ratio, e.g. 4:5:6 or 7:9:11. Rows are added or removed to match.'),
        ratioTool()),

      el('section', { class: 'card' },
        el('div', { class: 'card-head' }, el('strong', {}, 'Sync sections')),
        el('p', { class: 'hint' }, 'All rows glide to one row’s tempo and align. Write each as start +length, e.g. 5:00 +1:30. Leave empty for none.'),
        el('div', { class: 'grid' },
          field('Sections', config.sync, 'windows', { wide: true, toText: windowsToText, parse: windowsFromText }),
          field('Glide (seconds)', config.sync, 'ramp', { type: 'number', min: 1, max: 120, step: 1 }),
          select('Follow row', String(config.sync.ref || 0), config.rows.map((r, i) => [String(i), (i + 1) + ' · ' + r.name]),
            (v) => { config.sync.ref = parseInt(v, 10); changed(); }))),

      el('section', { class: 'card' },
        el('div', { class: 'card-head' }, el('strong', {}, 'Silences')),
        el('p', { class: 'hint' }, 'Nobody plays (for one row alone, use Tacet in its row card): the rows fade out and a countdown shows when they return. Write each as start +length, e.g. 12:00 +0:45. Leave empty for none.'),
        el('div', { class: 'grid' },
          field('Silences', config, 'silences', { wide: true, toText: windowsToText, parse: windowsFromText }))),

      el('section', { class: 'card' },
        el('div', { class: 'card-head' }, el('strong', {}, 'Pitch changes')),
        el('p', { class: 'hint' }, 'Each row moves to its next pitch at a seeded random moment inside each span, e.g. 4:00-4:45.'),
        el('div', { class: 'grid' },
          field('Spans', config, 'pitchWindows', { wide: true, toText: spansToText, parse: spansFromText }))),

      ...[tilingCard()].filter(Boolean),

      ...config.rows.map(rowCard),

      el('div', { class: 'setup-actions' },
        config.rows.length < 8 && el('button', { class: 'tool', onclick: () => { addRow(); render(); apply(); } }, 'Add row')),

      el('div', { class: 'setup-actions' },
        el('button', { class: 'tool', onclick: exportJson }, 'Export file'),
        el('button', { class: 'tool', onclick: () => document.getElementById('setup-import').click() }, 'Import file'),
        el('button', { class: 'tool', onclick: copyLink }, 'Copy link'),
        el('input', { type: 'file', id: 'setup-import', accept: '.json,application/json', hidden: 'hidden', onchange: importJson })),

      el('p', { id: 'setup-status' }),
      el('p', { class: 'credit' }, 'Composed and designed by Rob Casey. First version July 2025. © 2025–2026 Rob Casey.'));

    panel.scrollTop = scroll;
  }

  // Length is edited in minutes but stored in seconds.
  function minutesField() {
    const proxy = { minutes: Math.round(config.duration / 6) / 10 };
    const node = field('Length (minutes)', proxy, 'minutes', { type: 'number', min: 0.5, max: 180, step: 0.5 });
    node.querySelector('input').addEventListener('input', () => { config.duration = proxy.minutes * 60; });
    return node;
  }

  // --- Saving and sharing ---------------------------------------------------

  function exportJson() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = el('a', {
      href: URL.createObjectURL(blob),
      download: (config.title || 'score').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json',
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      const status = document.getElementById('setup-status');
      try {
        const next = JSON.parse(text);
        const result = RS.app.applyConfig(next);
        if (!result.ok) throw new Error(result.error);
        config = JSON.parse(JSON.stringify(next));
        render();
        apply();
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Could not import that file: ' + err.message;
      }
    });
  }

  function copyLink() {
    const link = location.origin + location.pathname + '#c=' + RS.encodeConfig(config);
    const status = document.getElementById('setup-status');
    const done = () => { status.className = ''; status.textContent = 'Link copied. Anyone opening it gets this exact piece.'; };
    const fallback = () => { window.prompt('Copy this link:', link); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fallback);
    else fallback();
  }

  RS.encodeConfig = (cfg) => btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  RS.decodeConfig = (text) => JSON.parse(decodeURIComponent(escape(atob(text.replace(/-/g, '+').replace(/_/g, '/')))));

  // Redraw the panel when a MIDI device or the OSC bridge comes or goes.
  RS.output.onChange = () => {
    if (panel.hidden || !config) return;
    if (panel.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)
      && document.activeElement.type !== 'checkbox') return; // don't interrupt typing
    render();
    apply();
  };

  RS.setup = {
    get isOpen() { return !panel.hidden; },
    open() {
      config = JSON.parse(JSON.stringify(RS.app.config));
      panel.hidden = false;
      document.body.classList.add('setup-open');
      render();
      apply();
      window.dispatchEvent(new Event('resize'));
    },
    close() {
      panel.hidden = true;
      document.body.classList.remove('setup-open');
      window.dispatchEvent(new Event('resize'));
    },
    toggle() { this.isOpen ? this.close() : this.open(); },
  };
})();
