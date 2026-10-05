/* Sign-in: the class is a constellation. Thirteen stars, one per student,
   trace the Σ of 5 Sigma; you sign in by tapping your own star. Teachers pick
   their name below. Success jumps through the stars into the app. */

import { state } from '../core/store.js';
import { login } from '../core/store.js';
import { needsPasscode } from '../core/store.js';
import { STUDENT_NAMES } from '../core/data.js';
import { staffTeachers } from '../core/domain.js';
import { html } from '../ui/dom.js';
import { raw } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { prefersReducedMotion } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { personName } from '../ui/format.js';

// Σ traced from top-right: top bar, down to the middle point, down to bottom-left, bottom bar.
// The bars run edge to edge (12%–88%) so the long names on the bottom bar
// (Nathaneil, Hazarinna) have room; on a narrow sky every other bottom name
// drops to a second line ('b2', see 05-login.css).
export const SIGMA_POINTS = [
  [88, 10, 't'], [62.67, 10, 't'], [37.33, 10, 't'], [12, 10, 't'],
  [26.67, 23.33, 'r'], [41.33, 36.67, 'r'], [56, 50, 'r'],
  [41.33, 63.33, 'r'], [26.67, 76.67, 'r'],
  [12, 90, 'b'], [37.33, 90, 'b b2'], [62.67, 90, 'b'], [88, 90, 'b b2']
];
const LINE = '88,10 12,10 56,50 12,90 88,90';

let root = null, onDone = null, picked = null, mode = 'stars';

function onlineNames() {
  const t = Date.now();
  return STUDENT_NAMES.filter(n => state.users[n] && state.users[n].lastSeen && t - state.users[n].lastSeen.getTime() < 5 * 60000);
}

export function constellationHTML(opts) {
  opts = opts || {};
  const online = opts.online || [];
  const lit = opts.lit || {};
  const names = opts.names || STUDENT_NAMES;
  return html`<div class="constellation${opts.cls ? ' ' + opts.cls : ''}" role="group" aria-label="${opts.label || 'Pilih bintang anda'}">
    <svg class="c-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${LINE}" pathLength="100"/></svg>
    ${STUDENT_NAMES.map((name, i) => {
      const [x, y, side] = SIGMA_POINTS[i];
      const inRoster = names.includes(name);
      const tagOpen = raw(opts.static ? 'span' : 'button type="button"'), tagClose = raw(opts.static ? 'span' : 'button');
      return html`<${tagOpen} class="cstar ${side.split(' ').map(x => 'l-' + x).join(' ')}${online.includes(name) ? ' is-online' : ''}${lit[name] ? ' is-lit' : ''}${inRoster ? '' : ' is-off'}" data-star="${name}" style="--x:${x}%;--y:${y}%;--i:${i}" ${opts.static ? '' : html`aria-label="${personName(name)}${online.includes(name) ? ', sedang aktif' : ''}"`}>
        <i class="cstar-core" aria-hidden="true"></i><span class="cstar-name">${personName(name)}</span>
      </${tagClose}>`;
    })}
  </div>`;
}

function render() {
  const online = onlineNames();
  setHTML(root, html`
    <div class="login-wrap">
      <section class="login-side">
        <header class="login-head">
          <span class="mark mark-xl" aria-hidden="true">5<i>Σ</i></span>
          <h1>Langit 5 Sigma</h1>
          <p>Setiap bintang ialah seorang pelajar 5 Sigma. Tekan bintang anda untuk masuk.</p>
        </header>
        <div class="login-card" ${picked || mode === 'teacher' ? '' : 'hidden'} aria-live="polite"></div>
        <div class="login-alt">
          <button type="button" class="link-btn" data-teacher>${icon('guru', 18)} Saya cikgu</button>
        </div>
        <p class="login-fine">Σ ialah simbol hasil tambah: 13 bintang, satu kelas.</p>
      </section>
      <div class="login-stage${picked ? ' has-pick' : ''}" data-mode="${mode}">
        ${constellationHTML({ online })}
        <p class="login-online">${online.length ? html`<i class="dot-live"></i>${online.length} rakan sedang aktif` : html`Langit sunyi buat masa ini`}</p>
      </div>
    </div>`);
  renderCard();
}

function renderCard() {
  const card = root.querySelector('.login-card');
  if (!card) return;
  root.querySelector('.login-stage').classList.toggle('has-pick', !!picked);
  root.querySelectorAll('.cstar').forEach(s => s.classList.toggle('is-picked', s.dataset.star === picked));
  if (mode === 'teacher') {
    card.hidden = false;
    const list = staffTeachers(state.config);
    setHTML(card, html`
      <h2>Log masuk cikgu</h2>
      <p class="muted">Pilih nama anda.</p>
      <div class="teacher-chips">${list.map(t => html`<button type="button" class="chip" data-t="${t}">${t}</button>`)}</div>
      <form class="teacher-other" novalidate><label class="field"><span class="field-label">Atau tulis nama anda</span><input id="login-teacher-name" class="input" type="text" autocomplete="off" placeholder="Contoh: Cikgu Rahim"></label>
        <button type="submit" class="btn primary">Masuk</button></form>
      <button type="button" class="link-btn" data-back>${icon('left', 16)} Kembali ke bintang</button>`);
    return;
  }
  if (!picked) { card.hidden = true; return; }
  card.hidden = false;
  const admin = needsPasscode(picked);
  setHTML(card, html`
    <form class="pick-form" novalidate>
      <span class="pick-eyebrow">Selamat kembali,</span>
      <h2>${personName(picked)}</h2>
      ${admin ? html`<label class="field"><span class="field-label">Kod admin</span><input id="login-pass" class="input input-code" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••"></label>` : ''}
      <button type="submit" class="btn primary btn-lg btn-block">${icon('spark', 18)}<span>Masuk ke langit</span></button>
      <button type="button" class="link-btn" data-back>Bukan saya</button>
    </form>`);
  const pass = card.querySelector('#login-pass');
  if (pass) setTimeout(() => pass.focus(), 50);
}

async function doLogin(name, type, extra) {
  const res = await login(name, type, extra);
  if (!res.ok) {
    toast(res.message, 'error');
    const f = root.querySelector('.login-card');
    if (f) { f.classList.remove('is-shake'); void f.offsetWidth; f.classList.add('is-shake'); }
    return false;
  }
  leave();
  return true;
}

function leave() {
  const reduce = prefersReducedMotion();
  root.classList.add('is-leaving');
  if (onDone) onDone({ warp: !reduce });
  setTimeout(() => { root.hidden = true; root.classList.remove('is-leaving'); picked = null; mode = 'stars'; }, reduce ? 150 : 900);
}

export function initLogin(el, done) {
  root = el; onDone = done;
  on(root, 'click', '[data-star]', (e, s) => { picked = s.dataset.star; mode = 'stars'; renderCard(); });
  on(root, 'click', '[data-back]', () => { picked = null; mode = 'stars'; renderCard(); });
  on(root, 'click', '[data-teacher]', () => { picked = null; mode = 'teacher'; renderCard(); });
  on(root, 'click', '[data-t]', (e, b) => doLogin(b.dataset.t, 'Cikgu'));
  on(root, 'submit', '.teacher-other', e => { e.preventDefault(); const v = root.querySelector('#login-teacher-name').value.trim(); if (!v) { toast('Tulis nama anda dahulu.', 'error'); return; } doLogin(v, 'Cikgu'); });
  on(root, 'submit', '.pick-form', e => {
    e.preventDefault();
    const pass = root.querySelector('#login-pass');
    if (!pass) { doLogin(picked, 'Pelajar'); return; }
    if (!pass.value.trim()) { toast('Masukkan kod admin.', 'error'); pass.focus(); return; }
    const btn = root.querySelector('.pick-form button[type="submit"]');
    const label = btn && btn.querySelector('span');
    const was = label ? label.textContent : '';
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Menyemak…';
    // The admin check is deliberately slow: let the button show that first.
    setTimeout(async () => {
      if (await doLogin(picked, 'Pelajar', { passcode: pass.value })) return;
      if (btn) btn.disabled = false;
      if (label) label.textContent = was;
      pass.value = '';
      pass.focus();
    }, 40);
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && (picked || mode === 'teacher')) { picked = null; mode = 'stars'; renderCard(); } });
}

export function showLogin() {
  if (!root) return;
  picked = null; mode = 'stars';
  root.hidden = false;
  render();
}
export function refreshLogin() {
  if (!root || root.hidden) return;
  const stage = root.querySelector('.login-stage');
  if (!stage) return render();
  const online = onlineNames();
  root.querySelectorAll('.cstar').forEach(s => s.classList.toggle('is-online', online.includes(s.dataset.star)));
  const p = root.querySelector('.login-online');
  if (p) setHTML(p, online.length ? html`<i class="dot-live"></i>${online.length} rakan sedang aktif` : html`Langit sunyi buat masa ini`);
  if (mode === 'teacher' && !root.querySelector('.teacher-chips .chip')) renderCard();
}
