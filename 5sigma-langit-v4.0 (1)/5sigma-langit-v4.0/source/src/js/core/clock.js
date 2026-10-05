/* One clock for the whole app. Everything that asks "what time is it?" asks here,
   so the sandbox can offer a demo time shift without touching any other code. */

const OFFSET_KEY = 'langit5s-demo-offset';
let offset = 0;
try { offset = parseInt(localStorage.getItem(OFFSET_KEY) || '0', 10) || 0; } catch (e) { offset = 0; }

export function now() { return new Date(Date.now() + offset); }
export function nowMs() { return Date.now() + offset; }
export function getOffset() { return offset; }
export function setOffset(ms) {
  offset = Math.round(ms) || 0;
  try { if (offset) localStorage.setItem(OFFSET_KEY, String(offset)); else localStorage.removeItem(OFFSET_KEY); } catch (e) { /* memory only */ }
}

/* Second ticks for countdowns. Paused while the tab is hidden. */
const secondSubs = new Set();
let timer = null;
function fire() {
  const n = now();
  secondSubs.forEach(fn => { try { fn(n); } catch (e) { console.error(e); } });
}
function start() { if (!timer) timer = setInterval(fire, 1000); }
function stop() { if (timer) { clearInterval(timer); timer = null; } }

export function onSecond(fn) {
  secondSubs.add(fn);
  start();
  return () => { secondSubs.delete(fn); if (!secondSubs.size) stop(); };
}
export function initClock() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (secondSubs.size) { fire(); start(); }
  });
}
