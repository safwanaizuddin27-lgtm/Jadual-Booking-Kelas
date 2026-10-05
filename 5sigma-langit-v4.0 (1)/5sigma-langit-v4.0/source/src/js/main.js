/* 5 Sigma Class Hub · Langit 5Σ — boot and wiring. */

import { initStore } from './core/store.js';
import { state } from './core/store.js';
import { subscribe } from './core/store.js';
import { isOwnNotification } from './core/store.js';
import { initClock } from './core/clock.js';
import { now } from './core/clock.js';
import { isoDate } from './core/util.js';
import { subjectColor } from './core/data.js';
import { computeStatus } from './core/domain.js';
import { sortByTime } from './core/domain.js';
import { initRouter } from './ui/router.js';
import { registerView } from './ui/router.js';
import { startRouter } from './ui/router.js';
import { rerender } from './ui/router.js';
import { setGuard } from './ui/router.js';
import { currentView } from './ui/router.js';
import { navigate } from './ui/router.js';
import { onNavigate } from './ui/router.js';
import { initShell } from './ui/shell.js';
import { renderShell } from './ui/shell.js';
import { updateBadge } from './ui/shell.js';
import { fitDate } from './ui/shell.js';
import { toast } from './ui/toast.js';
import { initLogin } from './views/login.js';
import { showLogin } from './views/login.js';
import { refreshLogin } from './views/login.js';
import { dashboardView } from './views/dashboard.js';
import { setDashboardAsk } from './views/dashboard.js';
import { jadualView } from './views/jadual.js';
import { tempahView } from './views/tempah.js';
import { guruView } from './views/people.js';
import { subjekView } from './views/people.js';
import { penggunaView } from './views/people.js';
import { statistikView } from './views/statistik.js';
import { kelasView } from './views/admin.js';
import { tetapView } from './views/admin.js';
import { tetapanView } from './views/admin.js';
import { openSandboxSheet } from './views/admin.js';
import { paparanView } from './views/paparan.js';
import { spmView } from './views/spm.js';
import { openNotifications } from './views/actions.js';
import { openProfile } from './views/actions.js';
import { openClassSheet } from './views/actions.js';
import { initAssistant } from './features/assistant.js';
import { openAssistant } from './features/assistant.js';
import { resetAssistant } from './features/assistant.js';
import { onClaude } from './features/host.js';
import { initSky } from './fx/sky.js';
import { initTheme } from './fx/theme.js';
import { onTheme } from './fx/theme.js';
import { getTheme } from './fx/theme.js';
import { toggleTheme } from './fx/theme.js';
import { initSpotlight } from './fx/motion.js';
import { initMotion } from './fx/motion.js';
import { onMotionChange } from './fx/motion.js';
import { motionReduced } from './fx/motion.js';

document.documentElement.lang = 'ms';   // the claude.ai host supplies its own <html>
initTheme();
initMotion();
const sky = initSky(document.getElementById('sky'));
if (motionReduced()) sky.setStill(true);
onMotionChange(on => sky.setStill(on));
sky.setTheme(getTheme());
onTheme(mode => { sky.setTheme(mode); if (state.user) renderShell(); });
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

initClock();
initStore();

[dashboardView, jadualView, tempahView, guruView, subjekView, spmView, penggunaView, statistikView, kelasView, tetapView, tetapanView, paparanView].forEach(registerView);
setGuard(id => (id !== 'kelas' && id !== 'tetap') || state.isAdmin);

const app = document.getElementById('app');
const loginRoot = document.getElementById('login');
initRouter(document.getElementById('views'));
initShell({
  ask: q => openAssistant(q),
  notifications: openNotifications,
  profile: openProfile,
  theme: el => toggleTheme(el),
  openClass: id => openClassSheet(id),
  sandbox: openSandboxSheet
});
setDashboardAsk(q => openAssistant(q));
tempahView.ask = q => openAssistant(q);
initAssistant();
initSpotlight();

// Paparan Kelas fills the screen: no rail or tab bar, faster sky.
onNavigate(id => {
  document.body.classList.toggle('is-display', id === 'paparan');
  sky.setFps(id === 'paparan' ? 30 : (coarse ? 10 : 24));
  if (id === 'paparan') sky.setTints(skyColors());
});

function skyColors() {
  const n = now(), today = isoDate(n);
  const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today));
  const live = list.filter(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
  const out = [];
  live.concat(list).forEach(b => { const c = subjectColor(b.subject); if (out.indexOf(c) === -1) out.push(c); });
  return out;
}

function enterApp(opts) {
  loginRoot.hidden = true;
  document.body.classList.remove('is-login');
  renderShell();
  app.hidden = false;
  fitDate();
  if (opts && opts.arrive) {
    app.classList.add('is-arriving');
    setTimeout(() => app.classList.remove('is-arriving'), 1600);
  }
  startRouter('utama');
  sky.setFps(coarse ? 10 : 24);
}
function enterLogin() {
  app.hidden = true;
  document.body.classList.add('is-login');
  document.body.classList.remove('is-display');
  sky.setFps(30);
  showLogin();
}

initLogin(loginRoot, ({ warp }) => {
  if (warp) { sky.warp(); setTimeout(() => enterApp({ arrive: true }), 650); }
  else enterApp({ arrive: false });
});

subscribe((reason, detail) => {
  if (reason === 'session') {
    if (!state.user) { resetAssistant(); enterLogin(); return; }
    return;   // the login view drives the transition in
  }
  if (reason === 'notifications') {
    updateBadge();
    const fresh = ((detail && detail.fresh) || []).filter(nf => !isOwnNotification(nf.id));
    if (state.user && fresh.length) {
      fresh.slice(0, 2).forEach(nf => toast(nf.title, 'info'));
      if (!onClaude && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
        fresh.slice(0, 3).forEach(nf => { try { new Notification(nf.title, { body: nf.body || '', tag: nf.id }); } catch (e) { /* ignore */ } });
      }
    }
  }
  if (reason === 'bookings' || reason === 'tick') sky.setTints(skyColors());
  if (!state.user) { if (reason === 'users' || reason === 'config') refreshLogin(); return; }
  if (reason === 'config' && currentView()) renderShell();
  rerender(reason);
});

document.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'j') && state.user) { e.preventDefault(); openAssistant(); }
});

if (state.user) enterApp({ arrive: false }); else enterLogin();

// Installed app + offline (served over https or localhost; never inside claude.ai).
if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol) && !onClaude) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
