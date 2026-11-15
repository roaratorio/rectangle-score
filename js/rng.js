// Rectangle Score. © 2025–2026 Rob Casey.
// Seeded random numbers: the same seed always gives the same piece.
(function () {
  const RS = (globalThis.RS = globalThis.RS || {});

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // Returns a function giving numbers in [0, 1). `stream` keeps separate
  // uses (e.g. each row's pitch timings) independent of one another.
  RS.makeRng = function (seed, stream) {
    let a = hashString(String(seed) + '/' + String(stream || ''));
    const next = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.between = (min, max) => min + next() * (max - min);
    return next;
  };

  const WORDS = ['amber', 'birch', 'cobalt', 'drift', 'ember', 'fathom', 'glass', 'harbour',
    'indigo', 'juniper', 'kelp', 'lumen', 'moss', 'nimbus', 'ochre', 'pewter',
    'quartz', 'russet', 'slate', 'tallow', 'umber', 'vellum', 'willow', 'zinc'];

  RS.randomSeed = function () {
    const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
    return pick() + '-' + pick() + '-' + Math.floor(Math.random() * 90 + 10);
  };
})();
