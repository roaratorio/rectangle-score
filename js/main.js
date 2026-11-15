// Transport and controls: the clock, play / pause / seek, keyboard and toolbar.
(function () {
  const RS = globalThis.RS;
  const STORE_KEY = 'rectangle-score.config';
  const PANEL_WIDTH = 460;

  const canvas = document.getElementById('score');
  const ctx = canvas.getContext('2d');
  const playBtn = document.getElementById('play');

  const params = new URLSearchParams(location.search);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // Which piece to open: a shared link, else ?piece=, else the last one
  // edited on this computer, else the default preset.
  function initialConfig() {
    const hash = /[#&]c=([^&]+)/.exec(location.hash);
    if (hash) {
      try {
        const cfg = RS.decodeConfig(hash[1]);
        RS.buildScore(cfg);
        history.replaceState(null, '', location.pathname + location.search);
        return cfg;
      } catch (e) { console.warn('Could not read the shared link', e); }
    }
    if (RS.presets[params.get('piece')]) return clone(RS.presets[params.get('piece')]);
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) { RS.buildScore(saved); return saved; }
    } catch (e) { /* nothing saved, or it no longer loads */ }
    return clone(RS.presets[RS.defaultPreset]);
  }

  let config = initialConfig();
  if (params.get('seed')) config.seed = params.get('seed');
  let score = RS.buildScore(config);

  let W = 0, H = 0;
  const ui = {
    theme: params.get('theme') === 'dark' ? 'dark' : 'light',
    playing: false,
    cue: 0,          // the count-in runs up to this time
    hoverT: null,
  };

  // The clock: time is always "anchor time + real time elapsed since anchor",
  // so a slow frame or a hidden tab can never make the piece drift.
  let anchorT = -score.countIn;
  let anchorNow = performance.now();

  function now() {
    if (!ui.playing) return anchorT;
    return anchorT + (performance.now() - anchorNow) / 1000;
  }

  function setTime(t) {
    anchorT = t;
    anchorNow = performance.now();
    RS.output.reset(); // any notes already queued belong to the old position
  }

  function play() {
    if (ui.playing) return;
    if (anchorT >= score.duration) cueTo(0);
    setTime(anchorT);
    RS.output.prepare();
    ui.playing = true;
    keepAwake(true);
    refreshBar();
  }

  function pause() {
    if (!ui.playing) return;
    setTime(now());
    ui.playing = false;
    keepAwake(false);
    refreshBar();
  }

  // Jump to a point with a count-in before it (for starting and rehearsing).
  function cueTo(t) {
    t = Math.min(Math.max(t, 0), score.duration);
    ui.cue = t;
    setTime(t - score.countIn);
  }

  // Jump straight to a point, no count-in.
  function jumpBy(seconds) {
    const t = Math.min(Math.max(now() + seconds, -score.countIn), score.duration);
    ui.cue = t < 0 ? 0 : Math.min(ui.cue, t);
    setTime(t);
  }

  // Swap in a new version of the piece. A config that cannot be built is
  // refused and the current score stays as it was.
  function applyConfig(next) {
    let built;
    try {
      if (!next || !Array.isArray(next.rows) || !next.rows.length) throw new Error('the piece needs at least one row');
      if (!(next.duration > 0)) throw new Error('the length must be more than zero');
      built = RS.buildScore(next);
    } catch (e) {
      return { ok: false, error: e.message };
    }
    const t = now();
    const atStart = t <= 0;
    config = clone(next);
    score = built;
    if (atStart) cueTo(0);
    else { setTime(Math.min(t, score.duration)); ui.cue = Math.min(ui.cue, score.duration); }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch (e) { /* private window */ }
    document.title = (config.title || 'Rectangle Score');
    return { ok: true };
  }

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not available here; harmless */ }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const panelOpen = RS.setup.isOpen && window.innerWidth > PANEL_WIDTH + 500;
    W = window.innerWidth - (panelOpen ? PANEL_WIDTH : 0);
    H = window.innerHeight;
    canvas.style.width = W + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame() {
    let t = now();
    if (ui.playing && t >= score.duration) {
      t = score.duration;
      ui.playing = false;
      setTime(t);
      keepAwake(false);
      refreshBar();
    }
    RS.output.tick(score, t, ui.playing);
    RS.draw(ctx, W, H, score, t, ui);
    requestAnimationFrame(frame);
  }

  // --- Toolbar --------------------------------------------------------------

  function refreshBar() {
    playBtn.textContent = ui.playing ? 'Pause' : 'Play';
    document.body.dataset.theme = ui.theme;
    document.body.classList.toggle('playing', ui.playing);
  }

  function toggleTheme() {
    ui.theme = ui.theme === 'dark' ? 'light' : 'dark';
    refreshBar();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }

  const onClick = (id, fn) => document.getElementById(id).addEventListener('click', (e) => {
    e.currentTarget.blur(); // so Space afterwards plays/pauses rather than re-pressing the button
    fn();
  });
  onClick('play', () => (ui.playing ? pause() : play()));
  onClick('restart', () => cueTo(0));
  onClick('open-setup', () => RS.setup.toggle());
  onClick('theme', toggleTheme);
  onClick('full', toggleFullscreen);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return; // typing in setup
    const big = e.shiftKey ? 60 : 10;
    if (e.key === ' ') { e.preventDefault(); ui.playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') jumpBy(big);
    else if (e.key === 'ArrowLeft') jumpBy(-big);
    else if (e.key === 'Home' || e.key === '0') cueTo(0);
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === 'd' || e.key === 'D') toggleTheme();
    else if (e.key === 's' || e.key === 'S') RS.setup.toggle();
    else if (e.key === 'Escape' && RS.setup.isOpen) RS.setup.close();
  });

  // Click the timeline to cue from that point.
  function timelineTime(e) {
    const tl = RS.layout(W, H, score.rows.length).tl;
    if (e.clientY < tl.y - 8 || e.clientY > tl.y + tl.h + 20) return null;
    if (e.clientX < tl.x - 4 || e.clientX > tl.x + tl.w + 4) return null;
    return score.duration * Math.min(1, Math.max(0, (e.clientX - tl.x) / tl.w));
  }

  canvas.addEventListener('mousemove', (e) => {
    ui.hoverT = timelineTime(e);
    canvas.style.cursor = ui.hoverT === null ? '' : 'pointer';
  });
  canvas.addEventListener('mouseleave', () => { ui.hoverT = null; });
  canvas.addEventListener('click', (e) => {
    const t = timelineTime(e);
    if (t !== null) cueTo(t);
  });

  // The toolbar gets out of the way while playing.
  let idleTimer = null;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 2500);
  }
  window.addEventListener('mousemove', wake);
  window.addEventListener('resize', resize);

  // Also handy for experimenting from the browser console.
  RS.app = {
    get score() { return score; },
    get config() { return config; },
    now, play, pause, cueTo, setTime, applyConfig, ui,
  };

  document.title = config.title || 'Rectangle Score';
  resize();
  refreshBar();
  wake();
  requestAnimationFrame(frame);
})();
