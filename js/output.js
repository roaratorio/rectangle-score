// Mock-up output: plays the score's notes as built-in sound, MIDI and/or OSC.
//
// Notes are scheduled a quarter of a second ahead with exact timestamps, so
// their timing does not depend on the screen's frame rate.
//   Row 1 -> MIDI channel 1 and OSC /gate/1, row 2 -> channel 2 and /gate/2, ...
// These settings belong to this computer, not to the piece.
(function () {
  const RS = (globalThis.RS = globalThis.RS || {});
  const STORE_KEY = 'rectangle-score.output';
  const LOOKAHEAD = 0.25; // seconds

  const settings = Object.assign({
    audio: false,
    midi: false,
    midiOutput: '',                 // device name; empty = first available
    osc: false,
    oscUrl: 'ws://localhost:8080',  // the WebSocket-to-OSC bridge
    notes: 'random',                // 'random': one note of the pitch set; 'all': the whole set
    length: 1,                      // seconds
  }, load());

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }

  const status = { midi: '', osc: '' };
  let audioCtx = null;
  let midiAccess = null;
  let socket = null;
  let liveVoices = [];   // built-in sounds still ringing
  let oscTimers = [];
  let pointers = null;   // next unscheduled note in each row
  let lastScore = null;
  let wasPlaying = false;
  const stats = { notes: 0 };

  function changed() { if (RS.output.onChange) RS.output.onChange(); }

  // --- Pitches --------------------------------------------------------------

  const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function midiNumber(name) {
    const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
    if (!m) return null;
    return SEMITONES[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  }

  // The notes a row plays for one hit: taken from the pitch set on screen at that moment.
  function notesFor(score, rowIndex, hit) {
    const tl = score.rows[rowIndex].pitchTimeline;
    let j = 0;
    while (j + 1 < tl.length && tl[j + 1].t <= hit.t) j++;
    const all = tl[j].chord.map(midiNumber).filter((n) => n !== null);
    if (settings.notes === 'all' || all.length < 2) return all;
    const pick = RS.makeRng(score.seed, 'note/' + rowIndex + '/' + hit.cell)();
    return [all[Math.floor(pick * all.length)]];
  }

  // --- Built-in sound -------------------------------------------------------

  const WAVES = ['triangle', 'sine', 'square', 'sawtooth'];

  function playTone(rowIndex, note, delay) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const start = audioCtx.currentTime + Math.max(0, delay);
    const length = Math.max(0.05, settings.length);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const wave = WAVES[rowIndex % WAVES.length];
    osc.type = wave;
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    const peak = wave === 'square' || wave === 'sawtooth' ? 0.07 : 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + length);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + length + 0.05);
    const voice = { osc, gain };
    liveVoices.push(voice);
    osc.onended = () => { liveVoices = liveVoices.filter((v) => v !== voice); };
  }

  function ensureAudio() {
    if (!settings.audio) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // --- MIDI -----------------------------------------------------------------

  function midiOutputs() {
    return midiAccess ? Array.from(midiAccess.outputs.values()) : [];
  }

  function currentMidiOutput() {
    const outs = midiOutputs();
    return outs.find((o) => o.name === settings.midiOutput) || outs[0] || null;
  }

  function refreshMidiStatus() {
    const out = currentMidiOutput();
    status.midi = !midiAccess ? '' : out ? 'Sending to ' + out.name : 'No MIDI outputs found';
  }

  function enableMidi() {
    if (midiAccess) { refreshMidiStatus(); return Promise.resolve(); }
    if (!navigator.requestMIDIAccess) {
      status.midi = 'This browser has no MIDI support (use Chrome or Edge)';
      changed();
      return Promise.resolve();
    }
    status.midi = 'Asking for MIDI access…';
    return navigator.requestMIDIAccess().then((access) => {
      midiAccess = access;
      access.onstatechange = () => { refreshMidiStatus(); changed(); };
      refreshMidiStatus();
      changed();
    }, (err) => {
      status.midi = 'MIDI access was refused';
      changed();
    });
  }

  function sendMidi(rowIndex, note, delay) {
    const out = currentMidiOutput();
    if (!out) return;
    const channel = rowIndex % 16;
    const at = performance.now() + Math.max(0, delay) * 1000;
    out.send([0x90 | channel, note, 90], at);
    out.send([0x80 | channel, note, 0], at + Math.max(0.05, settings.length) * 1000);
  }

  // --- OSC (through the WebSocket bridge) -----------------------------------

  function connectOsc() {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    try {
      const ws = new WebSocket(settings.oscUrl);
      socket = ws;
      status.osc = 'Connecting…';
      ws.onopen = () => { status.osc = 'Connected to the bridge'; changed(); };
      ws.onclose = () => { if (socket === ws) { status.osc = 'Not connected: start the OSC bridge'; changed(); } };
      ws.onerror = () => { if (socket === ws) { status.osc = 'Not connected: start the OSC bridge'; changed(); } };
    } catch (e) {
      status.osc = 'That address is not valid';
    }
    changed();
  }

  function disconnectOsc() {
    if (socket) { const ws = socket; socket = null; try { ws.close(); } catch (e) { /* already closed */ } }
    status.osc = '';
  }

  function sendOsc(rowIndex, delay) {
    const timer = setTimeout(() => {
      oscTimers = oscTimers.filter((x) => x !== timer);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'osc', address: '/gate/' + (rowIndex + 1), value: 1.0 }));
      }
    }, Math.max(0, delay) * 1000);
    oscTimers.push(timer);
  }

  // --- Scheduling -----------------------------------------------------------

  function silence() {
    liveVoices.forEach((v) => {
      try {
        v.gain.gain.cancelScheduledValues(0);
        v.gain.gain.value = 0;
        v.osc.stop();
      } catch (e) { /* already stopped */ }
    });
    liveVoices = [];
    oscTimers.forEach(clearTimeout);
    oscTimers = [];
    const out = settings.midi && currentMidiOutput();
    if (out) {
      try { if (out.clear) out.clear(); } catch (e) { /* not supported everywhere */ }
      for (let ch = 0; ch < 16; ch++) out.send([0xb0 | ch, 123, 0]);
    }
  }

  function firstHitFrom(hits, t) {
    let lo = 0, hi = hits.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hits[mid].t < t) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  RS.output = {
    settings, status, stats, midiOutputs, enableMidi,
    onChange: null,

    get active() { return settings.audio || settings.midi || settings.osc; },

    save() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* private window */ }
    },

    // Called when a setting is switched, and when Play is pressed.
    prepare() {
      ensureAudio();
      if (settings.midi) enableMidi(); else status.midi = '';
      if (settings.osc) connectOsc(); else disconnectOsc();
      if (!settings.audio && audioCtx) { audioCtx.close(); audioCtx = null; }
      changed();
    },

    // Called after any jump in time or change to the piece.
    reset() {
      silence();
      pointers = null;
    },

    // Called every frame with the current time.
    tick(score, t, playing) {
      if (!playing || !this.active) {
        if (wasPlaying) this.reset();
        wasPlaying = false;
        return;
      }
      if (!wasPlaying || score !== lastScore || !pointers) {
        pointers = score.rows.map((row) => firstHitFrom(row.hits, t));
        lastScore = score;
      }
      wasPlaying = true;
      const until = t + LOOKAHEAD;
      score.rows.forEach((row, i) => {
        while (pointers[i] < row.hits.length && row.hits[pointers[i]].t < until) {
          const hit = row.hits[pointers[i]++];
          const delay = hit.t - t;
          if (delay < -0.1) continue; // long past (e.g. after a stalled frame): skip it
          stats.notes++;
          const notes = notesFor(score, i, hit);
          notes.forEach((note) => {
            if (settings.audio) playTone(i, note, delay);
            if (settings.midi) sendMidi(i, note, delay);
          });
          if (settings.osc) sendOsc(i, delay);
        }
      });
    },
  };
})();
