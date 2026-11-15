// Rectangle Score. © 2025–2026 Rob Casey.
// Pieces. Everything about a piece lives in one of these objects.
//
// Tempo is in cells per minute. In the original p5 sketch a speed of 1.0
// worked out to 27 cells per minute, so 0.5 -> 13.5 and 1.5 -> 40.5.
//
// form: "seconds op" pairs.  +n / -n  add / remove a cell
//                            +h / -h  add / remove a note
// formScale stretches those times (the original was stretched 20 -> 26 min).
(function () {
  const RS = (globalThis.RS = globalThis.RS || {});

  RS.presets = {
    'july-2025': {
      title: 'Three Instrument Rectangles',
      seed: 'july-2025',
      duration: 26 * 60,
      countIn: 5,

      // All rows glide to row 1's tempo for these windows: [start, length] in seconds.
      sync: {
        ref: 0,
        ramp: 20,
        windows: [[300, 90], [498, 60], [696, 90], [894, 90], [1092, 120], [1290, 90]],
      },

      // Each row changes pitch once, at a random moment, inside each window.
      pitchWindows: [[240, 285], [558.75, 603.75], [877.5, 922.5], [1196.25, 1241.25], [1515, 1560]],

      rows: [
        {
          name: 'Recorder',
          cells: 6, hits: 1,
          tempo: { type: 'sine', center: 27, depth: 13.5, period: 1625 },
          formScale: 1.3,
          form: '2 +h, 10 +n, 15 -h, 25 +n, 40 +h, 50 +n, 60 -n, 70 +h, 85 -h, ' +
            '120 +n, 135 -n, 145 +h, 160 +n, 175 -h, 200 -n, 220 +h, 250 -n, 300 -h, ' +
            '350 +h, 375 -n, 400 +n, 430 -h, 450 +h, 500 +n, 520 -n, 550 +h, 600 -h, ' +
            '650 -n, 700 -n, 800 -h, 850 +n, 900 +h, 950 -n, 1000 +h, 1050 -n, ' +
            '1100 -h, 1150 +n, 1170 -n, 1190 -h, 1200 +h',
          pitches: [['D4'], ['D4', 'E4'], ['E4'], ['D4', 'E4', 'G4'], ['D4', 'E4'], ['D4']],
        },
        {
          name: 'Flute',
          cells: 5, hits: 0,
          tempo: { type: 'ramp', from: 16.2, to: 40.5, start: 146, end: 1592, shape: 'duration' },
          formScale: 1.3,
          form: '5 +h, 10 +n, 15 -h, 20 +h, 25 +h, 35 -n, 45 -h, 50 +n, 60 +h, 70 -h, ' +
            '105 -n, 125 +n, 140 +h, 155 -h, 175 +h, 195 -n, 230 -h, ' +
            '260 +n, 300 +h, 350 -h, 400 -n, 450 +h, 500 -h, ' +
            '600 +h, 700 -h, 850 +n, 1000 -n, 1150 +h',
          pitches: [['D4'], ['E4'], ['D4', 'E4'], ['D4', 'E4', 'G4'], ['D4', 'E4'], ['D4']],
        },
        {
          name: 'Piano',
          cells: 5, hits: 0,
          tempo: { type: 'ramp', from: 40.5, to: 16.2, start: 0, end: 1430, shape: 'duration' },
          formScale: 1.3,
          form: '2 +h, 12 +h, 16 +n, 20 -h, 24 +h, 40 +n, 55 -n, 65 -h, 80 +h, ' +
            '100 -h, 125 +n, 150 +h, 175 -n, 210 -h, 230 +h, 250 +n, 275 -h, 300 -n, ' +
            '350 +h, 400 -h, 525 -n, 575 +h, 625 -h, 675 +h, 725 -h, ' +
            '800 +n, 900 -n, 1000 +h, 1200 +n',
          pitches: [['D4'], ['G4'], ['D4', 'E4'], ['Bb3'], ['D4', 'E4'], ['Bb3']],
        },
      ],
    },
  };

  // Steady tempi in the ratio 4:5:6. With cycles of 4, 5 and 6 cells every
  // row's cycle lasts 15 seconds, so all three downbeats land together.
  RS.presets['ratios-4-5-6'] = {
    title: 'Ratios 4 : 5 : 6',
    seed: 'ratios',
    duration: 8 * 60,
    countIn: 5,
    sync: { ref: 0, ramp: 20, windows: [] },
    pitchWindows: [[150, 180], [320, 350]],
    rows: [
      { name: 'One', cells: 4, hits: 2, tempo: { type: 'const', bpm: 16 }, formMode: 'written', form: '',
        pitches: [['D4'], ['D4', 'E4'], ['E4']] },
      { name: 'Two', cells: 5, hits: 2, tempo: { type: 'const', bpm: 20 }, formMode: 'written', form: '',
        pitches: [['G4'], ['E4', 'G4'], ['A4']] },
      { name: 'Three', cells: 6, hits: 3, tempo: { type: 'const', bpm: 24 }, formMode: 'written', form: '',
        pitches: [['Bb3'], ['D4'], ['Bb3', 'D4']] },
    ],
  };

  // Two rows whose tempi cross: one accelerates as the other slows, meeting at
  // the midpoint. The patterns are generated from the seed.
  RS.presets['crossing-canon'] = {
    title: 'Crossing canon',
    seed: 'crossing',
    duration: 10 * 60,
    countIn: 5,
    sync: { ref: 0, ramp: 15, windows: [[285, 30]] },
    pitchWindows: [[200, 240], [400, 440]],
    rows: [
      { name: 'Rising', cells: 5, hits: 2, tempo: { type: 'ramp', from: 15, to: 45, start: 0, end: 600, shape: 'exp' },
        formMode: 'generated', gen: { every: [20, 45], cells: [3, 8], hits: [1, 4] },
        pitches: [['E4'], ['E4', 'F#4'], ['A4']] },
      { name: 'Falling', cells: 7, hits: 3, tempo: { type: 'ramp', from: 45, to: 15, start: 0, end: 600, shape: 'exp' },
        formMode: 'generated', gen: { every: [20, 45], cells: [3, 8], hits: [1, 4] },
        pitches: [['A4'], ['G4', 'A4'], ['E4']] },
    ],
  };

  // Three voices share one tempo and one rhythm, started at different points,
  // so that every cell is played by exactly one of them and no two ever coincide.
  const tilingWave = { type: 'sine', center: 54, depth: 14, period: 240 };
  RS.presets['tiling-canon'] = {
    title: 'Tiling canon',
    seed: 'tiling',
    duration: 8 * 60,
    countIn: 5,
    sync: { ref: 0, ramp: 20, windows: [] },
    tiling: { runs: 2, groups: 2, variant: 5 },
    pitchWindows: [[110, 130], [230, 250], [350, 370]],
    rows: [
      { name: 'One', cells: 12, hits: 4, tempo: tilingWave, pattern: { type: 'tiling' }, formMode: 'written', form: '',
        pitches: [['D4'], ['E4'], ['D4', 'E4'], ['D4']] },
      { name: 'Two', cells: 12, hits: 4, tempo: tilingWave, pattern: { type: 'tiling' }, formMode: 'written', form: '',
        pitches: [['G4'], ['A4'], ['G4'], ['E4', 'G4']] },
      { name: 'Three', cells: 12, hits: 4, tempo: tilingWave, pattern: { type: 'tiling' }, formMode: 'written', form: '',
        pitches: [['Bb3'], ['Bb3', 'D4'], ['C4'], ['Bb3']] },
    ],
  };

  // Two rhythms that never repeat, at tempi in the golden ratio (which never
  // realign), against a third voice building a pattern up and taking it apart.
  RS.presets['aperiodic'] = {
    title: 'Aperiodic',
    seed: 'aperiodic',
    duration: 10 * 60,
    countIn: 5,
    sync: { ref: 0, ramp: 20, windows: [] },
    pitchWindows: [[170, 200], [380, 410]],
    rows: [
      { name: 'Fibonacci', cells: 8, hits: 3, tempo: { type: 'const', bpm: 34 }, pattern: { type: 'fibonacci' },
        formMode: 'written', form: '', pitches: [['E4'], ['E4', 'F#4'], ['F#4']] },
      { name: 'Thue-Morse', cells: 8, hits: 4, tempo: { type: 'const', bpm: 55.01 }, pattern: { type: 'thue-morse' },
        formMode: 'written', form: '', pitches: [['A4'], ['G4', 'A4'], ['B4']] },
      { name: 'Additive', cells: 7, hits: 4, tempo: { type: 'const', bpm: 42 }, pattern: { type: 'additive', repeat: 2 },
        formMode: 'written', form: '', pitches: [['B3'], ['B3', 'D4'], ['C#4']] },
    ],
  };

  RS.defaultPreset = 'july-2025';
})();
