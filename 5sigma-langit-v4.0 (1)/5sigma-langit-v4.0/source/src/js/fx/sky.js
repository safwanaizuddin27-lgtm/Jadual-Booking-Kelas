/* The living sky behind the app: a twinkling starfield over a nebula tinted with
   the colours of today's subjects (the live class glows strongest). The same
   canvas does the warp jump after sign-in. Canvas 2D, about 30 fps, paused while
   the tab is hidden, and still when the user prefers reduced motion. */

import { hexToRgb } from '../core/util.js';

export function initSky(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const neb = document.createElement('canvas');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let still = reduce;
  let w = 0, h = 0, dpr = 1, stars = [];
  let tints = ['#7C3AED', '#2563EB', '#E11D48'];
  let theme = 'dark';
  let px = 0, py = 0, tx = 0, ty = 0;
  let warpAt = 0;
  let last = 0, raf = 0, frameMs = 33;
  // A shooting star every so often (night only).
  let meteor = null, nextMeteor = performance.now() + 4000 + Math.random() * 5000;

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    neb.width = canvas.width; neb.height = canvas.height;
    const count = Math.min(900, Math.round((w * h) / 2300));
    stars = [];
    for (let i = 0; i < count; i++) {
      const z = Math.random();
      stars.push({ x: Math.random() * w, y: Math.random() * h, z, r: 0.35 + z * z * 1.5, tw: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 2.2, gold: Math.random() < 0.06 });
    }
    paintNebula();
    if (still) draw(performance.now());
  }

  function paintNebula() {
    const c = neb.getContext('2d');
    const W = neb.width, H = neb.height;
    const g = c.createLinearGradient(0, 0, 0, H);
    if (theme === 'dark') { g.addColorStop(0, '#04050F'); g.addColorStop(0.55, '#080C26'); g.addColorStop(1, '#0E1340'); }
    else { g.addColorStop(0, '#E9E8F8'); g.addColorStop(0.6, '#F3EEF6'); g.addColorStop(1, '#FCEBDD'); }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const spots = [[0.82, 0.12, 0.75], [0.12, 0.78, 0.65], [0.55, 0.55, 0.5], [0.3, 0.18, 0.42]];
    c.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'multiply';
    tints.slice(0, 4).forEach((hex, i) => {
      const [r, gg, b] = hexToRgb(hex);
      const s = spots[i % spots.length];
      const rad = Math.max(W, H) * s[2];
      const grd = c.createRadialGradient(W * s[0], H * s[1], 0, W * s[0], H * s[1], rad);
      const a = theme === 'dark' ? (i === 0 ? 0.34 : 0.2) : (i === 0 ? 0.16 : 0.1);
      grd.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
      grd.addColorStop(0.45, `rgba(${r},${gg},${b},${a * 0.35})`);
      grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      c.fillStyle = grd; c.fillRect(0, 0, W, H);
    });
    c.globalCompositeOperation = 'source-over';
  }

  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(neb, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    const warp = warpAt ? Math.min(1, (t - warpAt) / 1100) : 0;
    const cx = w / 2, cy = h / 2;
    const night = theme === 'dark';
    const e = warp ? warp * warp * (3 - 2 * warp) : 0;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const twinkle = still ? 0.8 : 0.55 + 0.45 * Math.sin(t / 1000 * s.sp + s.tw);
      let x = s.x + px * (0.2 + s.z) * 18, y = s.y + py * (0.2 + s.z) * 12;
      x = ((x % w) + w) % w; y = ((y % h) + h) % h;
      const alpha = (night ? 0.25 + s.z * 0.75 : 0.12 + s.z * 0.3) * twinkle;
      if (warp) {
        const k1 = 1 + Math.max(0, e - 0.08) * (2 + s.z * 6), k2 = 1 + e * (2 + s.z * 6);
        ctx.strokeStyle = s.gold ? `rgba(255,214,120,${Math.min(1, alpha + e)})` : `rgba(225,230,255,${Math.min(1, alpha + e)})`;
        ctx.lineWidth = s.r * (1 + e * 1.5);
        ctx.beginPath();
        ctx.moveTo(cx + (x - cx) * k1, cy + (y - cy) * k1);
        ctx.lineTo(cx + (x - cx) * k2, cy + (y - cy) * k2);
        ctx.stroke();
      } else {
        ctx.fillStyle = s.gold ? `rgba(255,207,107,${alpha})` : (night ? `rgba(232,236,255,${alpha})` : `rgba(70,80,160,${alpha})`);
        ctx.fillRect(x, y, s.r, s.r);
      }
    }
    if (!warp && night && !still) {
      if (!meteor && t > nextMeteor) {
        const fromLeft = Math.random() < 0.5;
        meteor = { t0: t, x: fromLeft ? w * (0.05 + Math.random() * 0.4) : w * (0.55 + Math.random() * 0.4), y: h * Math.random() * 0.35, dx: fromLeft ? 1 : -1, len: 90 + Math.random() * 90, dur: 700 + Math.random() * 500 };
      }
      if (meteor) {
        const k = (t - meteor.t0) / meteor.dur;
        if (k >= 1) { meteor = null; nextMeteor = t + 7000 + Math.random() * 9000; }
        else {
          const dist = k * Math.min(w, h) * 0.55;
          const hx = meteor.x + meteor.dx * dist * 0.87, hy = meteor.y + dist * 0.5;
          const tx = hx - meteor.dx * meteor.len * 0.87, ty = hy - meteor.len * 0.5;
          const a = Math.sin(k * Math.PI);
          const g = ctx.createLinearGradient(hx, hy, tx, ty);
          g.addColorStop(0, `rgba(255,244,214,${0.9 * a})`); g.addColorStop(1, 'rgba(255,244,214,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      }
    }
    if (warp) {
      const flash = Math.max(0, (warp - 0.7) / 0.3);
      if (flash > 0) { ctx.fillStyle = `rgba(255,236,190,${flash * 0.55 * (1 - flash)})`; ctx.fillRect(0, 0, w, h); }
      if (warp >= 1) warpAt = 0;
    }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (t - last < frameMs && !warpAt) return;
    last = t;
    draw(t);
  }

  window.addEventListener('resize', () => { clearTimeout(resize._t); resize._t = setTimeout(resize, 120); });
  window.addEventListener('pointermove', e => { tx = (e.clientX / window.innerWidth - 0.5); ty = (e.clientY / window.innerHeight - 0.5); }, { passive: true });
  resize();
  if (!still) raf = requestAnimationFrame(loop); else draw(0);

  return {
    setTints(list) {
      const next = (list && list.length ? list : ['#7C3AED', '#2563EB', '#E11D48']).slice(0, 4);
      if (next.join() === tints.join()) return;
      tints = next; paintNebula(); if (still) draw(0);
    },
    setTheme(mode) { if (mode === theme) return; theme = mode; paintNebula(); if (still) draw(0); },
    warp() { if (still) return; warpAt = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    // "Kurangkan animasi" in Tetapan: a still sky (the system setting always wins).
    setStill(v) {
      still = !!v || reduce;
      if (still) { cancelAnimationFrame(raf); raf = 0; draw(performance.now()); }
      else if (!raf) raf = requestAnimationFrame(loop);
    },
    setFps(fps) { frameMs = 1000 / Math.max(1, fps); },
    get theme() { return theme; }
  };
}
