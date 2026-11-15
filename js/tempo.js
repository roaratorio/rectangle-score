// Tempo curves.
//
// A row's tempo is a curve of "cells per second" over time. Its PHASE is the
// running total of cells that have crossed the line (the area under the curve).
// Cell number k reaches the line exactly when phase == k, so everything the
// score shows or plays is calculated from the time, never counted in frames.
(function () {
  const RS = (globalThis.RS = globalThis.RS || {});

  // points: [{t, v}] sorted by t, starting at t = 0, v in cells per second.
  // Straight lines between points; flat before the first and after the last.
  class Curve {
    constructor(points) {
      this.pts = points;
      this.cum = [0];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        this.cum.push(this.cum[i - 1] + 0.5 * (a.v + b.v) * (b.t - a.t));
      }
    }

    // Index of the last point with t <= time.
    _segByTime(t) {
      const p = this.pts;
      let lo = 0, hi = p.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (p[mid].t <= t) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    valueAt(t) {
      const p = this.pts;
      if (t <= p[0].t) return p[0].v;
      const i = this._segByTime(t);
      if (i >= p.length - 1) return p[p.length - 1].v;
      const a = p[i], b = p[i + 1];
      return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);
    }

    phaseAt(t) {
      const p = this.pts;
      if (t <= p[0].t) return p[0].v * (t - p[0].t);
      const i = this._segByTime(t);
      const a = p[i];
      const dt = t - a.t;
      if (i >= p.length - 1) return this.cum[i] + a.v * dt;
      const b = p[i + 1];
      const slope = (b.v - a.v) / (b.t - a.t);
      return this.cum[i] + a.v * dt + 0.5 * slope * dt * dt;
    }

    // The time at which a given phase (cell number) reaches the line.
    timeAt(phase) {
      const p = this.pts, cum = this.cum;
      if (phase <= 0) return p[0].t + phase / p[0].v;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cum[mid] <= phase) lo = mid; else hi = mid - 1;
      }
      const a = p[lo];
      const need = phase - cum[lo];
      if (lo >= p.length - 1) return a.t + need / a.v;
      const b = p[lo + 1];
      const slope = (b.v - a.v) / (b.t - a.t);
      // Solve a.v*dt + slope*dt^2/2 = need (stable form of the quadratic).
      return a.t + (2 * need) / (a.v + Math.sqrt(Math.max(0, a.v * a.v + 2 * slope * need)));
    }
  }

  // --- Tempo shapes (config values are in cells per minute) -----------------

  function shapeFunction(spec, duration) {
    switch (spec.type) {
      case 'const':
        return () => spec.bpm;
      case 'sine': {
        const phase = spec.phase || 0;
        return (t) => spec.center + spec.depth * Math.sin(2 * Math.PI * (t / spec.period + phase));
      }
      case 'ramp': {
        const start = spec.start || 0;
        const end = spec.end === undefined ? duration : spec.end;
        const from = Math.max(0.5, spec.from), to = Math.max(0.5, spec.to);
        spec = Object.assign({}, spec, { from, to });
        return (t) => {
          const u = Math.min(1, Math.max(0, (t - start) / Math.max(1e-6, end - start)));
          if (spec.shape === 'linear') return spec.from + (spec.to - spec.from) * u;
          if (spec.shape === 'exp') return spec.from * Math.pow(spec.to / spec.from, u);
          // 'duration': the length of each cell changes evenly (the default).
          return 1 / (1 / spec.from + (1 / spec.to - 1 / spec.from) * u);
        };
      }
      default:
        throw new Error('Unknown tempo type: ' + spec.type);
    }
  }

  // Turn a tempo shape into curve points, sampled every `step` seconds.
  RS.sampleTempo = function (spec, duration, step) {
    step = step || 2;
    const f = shapeFunction(spec, duration);
    const pts = [];
    for (let t = 0; t < duration; t += step) pts.push({ t, v: Math.max(0.5, f(t)) / 60 });
    pts.push({ t: duration, v: Math.max(0.5, f(duration)) / 60 });
    return pts;
  };

  RS.Curve = Curve;
})();
