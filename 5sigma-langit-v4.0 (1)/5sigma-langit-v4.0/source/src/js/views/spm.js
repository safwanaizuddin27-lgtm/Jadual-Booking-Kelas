/* Jadual SPM 2026: every paper, from the oral tests to the last written paper,
   after the official timetable (Lembaga Peperiksaan, KPM, 18 Ogos 2026).
   By default it shows this class's papers (a student sees only their own
   Pendidikan Islam or Pendidikan Moral paper); "Semua kertas" lists every
   SPM paper. The next paper is highlighted with a countdown, each science
   practical sits on its own day, and the papers can go to a calendar (.ics). */

import { state } from '../core/store.js';
import { isStudent } from '../core/store.js';
import { now } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { parseISO } from '../core/util.js';
import { addDays } from '../core/util.js';
import { daysBetween } from '../core/util.js';
import { at } from '../core/util.js';
import { SPM } from '../core/data.js';
import { SUBJECTS } from '../core/data.js';
import { SUBJECT_ROSTERS } from '../core/data.js';
import { subjectColor } from '../core/data.js';
import { subjectShort } from '../core/data.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { subjectBadge } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { dayName } from '../ui/format.js';
import { dateShort } from '../ui/format.js';
import { durationText } from '../ui/format.js';
import { rangeShort } from '../ui/format.js';
import { dateDayMonth } from '../ui/format.js';
import { icsForPapers } from '../features/share.js';
import { saveFile } from '../features/host.js';
import { onClaude } from '../features/host.js';
import { copyText } from '../features/host.js';
import { countUp } from '../fx/motion.js';

const v = { scope: 'kelas', subject: '' };
let root = null;

/* ---------------------------------------------------------------- data */
// Pendidikan Islam and Pendidikan Moral are sat by different students at the same time.
export function paperFor(p, user) {
  if (!p.subject) return false;
  const r = SUBJECT_ROSTERS[p.subject];
  if (!r || !user || !isStudent()) return true;
  return r.includes(user.name);
}
export function classPapers() {
  const u = state.user;
  return SPM.papers.filter(p => paperFor(p, u)).sort(byTime);
}
function byTime(a, b) { return (a.date + (a.from || '00:00')).localeCompare(b.date + (b.from || '00:00')) || a.code.localeCompare(b.code); }
const endOf = p => p.to ? at(p.dateTo, p.to) : at(p.dateTo, '23:59');
const startOf = p => p.from ? at(p.date, p.from) : at(p.date, '00:00');
export function nextPaper(list, n) { return list.find(p => endOf(p) > n) || null; }

function kindLabel(p) {
  return p.kind === 'lisan' ? 'Ujian lisan' : p.kind === 'amali' ? 'Ujian amali' : p.kind === 'mendengar' ? 'Ujian mendengar' : 'Bertulis';
}
function writtenWeek(iso) {
  if (iso < SPM.writtenStart || iso > SPM.writtenEnd) return 0;
  return Math.floor(daysBetween(SPM.writtenStart, iso) / 7) + 1;
}
function relDay(iso, isoTo, todayISO) {
  if (isoTo < todayISO) return { cls: 'is-past', text: 'Selesai' };
  if (iso <= todayISO && isoTo >= todayISO) return { cls: 'is-today', text: iso === isoTo ? 'Hari ini' : 'Sedang berlangsung' };
  const d = daysBetween(todayISO, iso);
  return { cls: '', text: d === 1 ? 'Esok' : d + ' hari lagi' };
}
function rangeText(p) {
  if (p.date === p.dateTo) return dayName(p.date) + ', ' + dateShort(p.date);
  return rangeShort(p.date, p.dateTo);
}

/* ---------------------------------------------------------------- markup */
function phases(n) {
  const today = isoDate(n);
  // From a few days before today (or a week before the oral tests) to just after the last paper.
  const from = [isoDate(addDays(n, -3)), '2026-10-19'].sort()[0], to = '2026-12-20';
  const span = daysBetween(from, to);
  const x = iso => Math.max(0, Math.min(100, daysBetween(from, iso) / span * 100));
  const items = [
    { label: 'Bertutur BM', from: '2026-10-26', to: '2026-10-29', cls: 'p-oral', subject: 'Bahasa Melayu' },
    { label: 'Bertutur BI', from: '2026-11-02', to: '2026-11-05', cls: 'p-oral', subject: 'English' },
    { label: 'Amali', from: '2026-11-16', to: '2026-11-18', cls: 'p-lab', subject: 'Kimia' },
    { label: 'Bertulis', from: SPM.writtenStart, to: SPM.writtenEnd, cls: 'p-written' }
  ];
  return html`<div class="spm-phases" role="img" aria-label="Fasa SPM 2026: Ujian Bertutur, Ujian Amali, kemudian peperiksaan bertulis">
    <div class="ph-track">
      ${items.map(it => html`<span class="ph ${it.cls}${it.to < today ? ' is-done' : ''}" style="left:${x(it.from).toFixed(2)}%;width:${Math.max(1.6, x(it.to) - x(it.from) + 1.2).toFixed(2)}%"></span>`)}
      ${today >= from && today <= to ? html`<i class="ph-now" style="left:${x(today).toFixed(2)}%"><em>Hari ini</em></i>` : ''}
    </div>
    <div class="ph-labels">${items.map(it => html`<span class="ph-l ${it.cls}" style="left:${x(it.from).toFixed(2)}%"><b>${it.label}</b><small>${rangeShort(it.from, it.to)}</small></span>`)}</div>
  </div>`;
}

function heroHTML(list, n) {
  const today = isoDate(n);
  const nx = nextPaper(list, n);
  const toWritten = daysBetween(today, SPM.writtenStart);
  const mine = list.filter(p => p.subject);
  const labs = SPM.papers.filter(p => p.kind === 'amali' && p.subject);
  return html`<section class="tile spm-hero">
    <div class="spm-hero-main">
      ${nx ? (() => {
        const live = startOf(nx) <= n;
        const d = daysBetween(today, nx.date);
        return html`<span class="eyebrow">${icon('clock', 16)} ${live ? 'Sedang berlangsung' : 'Kertas seterusnya'}</span>
          <div class="spm-next-row" style="--c:${subjectColor(nx.subject)}">${subjectBadge(nx.subject, 'lg', 'is-solid')}
            <div><b class="spm-next-name">${nx.name}</b><span class="spm-next-paper">${nx.paper} · ${nx.code}</span>
              <span class="spm-next-when">${rangeText(nx)}${nx.from ? ', ' + nx.from + '–' + nx.to : ' · masa mengikut jadual sekolah'}</span></div></div>
          <p class="spm-next-count">${live ? html`<b>Hari ini</b>` : d <= 0 ? html`<b>Hari ini</b>` : html`<b data-count="${d}">${d}</b> hari lagi`}</p>`;
      })() : html`<span class="eyebrow">${icon('star', 16)} SPM 2026</span><h3>Semua kertas sudah selesai. Tahniah, 5 Sigma!</h3>`}
    </div>
    <div class="spm-hero-side">
      <div class="spm-big"><b data-count="${Math.max(0, toWritten)}">${Math.max(0, toWritten)}</b><span>hari lagi ke<br>kertas bertulis pertama</span></div>
      <p class="muted spm-hero-facts">${mine.length} kertas${isStudent() ? ' anda' : ' kelas ini'} · bertulis ${dateShort(SPM.writtenStart)}–${dateShort(SPM.writtenEnd)} · amali ${labs.map(p => subjectShort(p.subject) + ' ' + dateShort(p.date).split(' ')[0]).join(', ')} Nov</p>
    </div>
    ${phases(n)}
  </section>`;
}

function rowHTML(p, n, nx) {
  const cls = p.subject ? '' : ' is-other';
  const done = endOf(p) <= n;
  const isNext = nx && p === nx;
  return html`<div class="spm-row${cls}${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}" style="--c:${p.subject ? subjectColor(p.subject) : 'var(--ink-3)'}">
    ${p.subject ? subjectBadge(p.subject, 'md') : html`<span class="sicon s-md is-plain" aria-hidden="true">${icon('subjek', 17)}</span>`}
    <span class="spm-time">${p.from ? html`<b>${p.from}</b><span>${p.to}</span>` : html`<b>${p.kind === 'lisan' ? 'Lisan' : 'Amali'}</b><span>${p.date === p.dateTo ? 'sehari' : '4 hari'}</span>`}</span>
    <span class="spm-main"><b>${p.name}</b><span>${p.paper}${p.from ? ' · ' + durationText(p.from, p.to) : ' · masa ditetapkan sekolah'}</span></span>
    <span class="spm-meta">${isNext ? html`<span class="pill gold">Seterusnya</span>` : done ? html`<span class="pill st-ended">Selesai</span>` : ''}<code>${p.code}</code></span>
  </div>`;
}

function listHTML(list, n) {
  const today = isoDate(n);
  const nx = nextPaper(list.filter(p => p.subject), n);
  const groups = [];
  list.forEach(p => {
    const key = p.date + '|' + p.dateTo;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, date: p.date, dateTo: p.dateTo, items: [] }; groups.push(g); }
    g.items.push(p);
  });
  if (!groups.length) return html`<div class="empty"><b>Tiada kertas</b><p>Cuba buang penapis subjek.</p></div>`;
  let lastWeek = -1;
  return html`<div class="spm-list">${groups.map(g => {
    const rel = relDay(g.date, g.dateTo, today);
    const wk = writtenWeek(g.date);
    const weekHead = wk && wk !== lastWeek ? html`<div class="spm-week"><span>Minggu ${wk} bertulis</span></div>` : '';
    lastWeek = wk || lastWeek;
    const kinds = Array.from(new Set(g.items.map(kindLabel)));
    return html`${weekHead}<section class="spm-day ${rel.cls}">
      <header class="spm-date">
        <span class="spm-cal"><small>${dayName(g.date).slice(0, 3)}</small><b>${parseISO(g.date).getDate()}${g.date !== g.dateTo ? '–' + parseISO(g.dateTo).getDate() : ''}</b><small>${dateShort(g.date).split(' ')[1]}</small></span>
        <span class="spm-date-main"><b>${g.date === g.dateTo ? dateDayMonth(g.date) : rangeText(g.items[0])}</b><span>${kinds.join(' · ')} · ${g.items.length} kertas</span></span>
        <span class="spm-rel">${rel.text}</span>
      </header>
      <div class="spm-rows">${g.items.map(p => rowHTML(p, n, nx))}</div>
    </section>`;
  })}</div>`;
}

function filtersHTML() {
  if (v.scope !== 'kelas') return '';
  return html`<div class="jd-subjects spm-filter" role="group" aria-label="Tapis mengikut subjek">
    <button type="button" class="chip${v.subject ? '' : ' is-on'}" data-sf="">Semua subjek</button>
    ${SUBJECTS.filter(s => classPapers().some(p => p.subject === s.name)).map(s => html`<button type="button" class="chip chip-subj${v.subject === s.name ? ' is-on' : ''}" data-sf="${s.name}" style="--c:${s.color}">${subjectIcon(s.name, 15)}${s.short}</button>`)}
  </div>`;
}

function paint(entering) {
  if (!root) return;
  const n = now();
  const mine = classPapers();
  const list = v.scope === 'semua' ? SPM.papers.slice().sort(byTime) : mine.filter(p => !v.subject || p.subject === v.subject);
  const scrollY = window.scrollY;
  setHTML(root, html`
    <div class="page-head"><div><h2 class="page-title">Jadual SPM 2026</h2>
      <p class="page-sub">${v.scope === 'semua' ? 'Setiap kertas SPM 2026 untuk semua mata pelajaran. Kertas kelas ini bertanda simbol subjek.' : isStudent() ? 'Setiap kertas anda, dari Ujian Bertutur hingga kertas terakhir. Setiap amali sains ada harinya sendiri.' : 'Setiap kertas kelas 5 Sigma, dari Ujian Bertutur hingga kertas terakhir. Setiap amali sains ada harinya sendiri.'}</p></div>
      <div class="page-tools">
        <div class="seg seg-lg" role="tablist" aria-label="Kertas yang ditunjuk">
          <button type="button" role="tab" data-scope="kelas" class="${v.scope === 'kelas' ? 'is-on' : ''}" aria-selected="${v.scope === 'kelas' ? 'true' : 'false'}">${icon('pengguna', 15)}<span>${isStudent() ? 'Kertas saya' : 'Kelas 5 Sigma'}</span></button>
          <button type="button" role="tab" data-scope="semua" class="${v.scope === 'semua' ? 'is-on' : ''}" aria-selected="${v.scope === 'semua' ? 'true' : 'false'}">${icon('list', 15)}<span>Semua kertas</span></button>
        </div>
        <button type="button" class="btn ghost" data-spm-cal>${icon('calplus', 17)}<span>${onClaude ? 'Salin jadual' : 'Simpan ke kalendar'}</span></button>
      </div></div>
    ${heroHTML(mine, n)}
    ${filtersHTML()}
    ${listHTML(list, n)}
    <p class="spm-source">${icon('info', 14)} Sumber: ${SPM.source}. Sahkan kertas anda dengan kenyataan kemasukan (slip pendaftaran) SPM. Ujian Bertutur dan Ujian Amali dijalankan di sekolah mengikut jadual yang ditetapkan sekolah.</p>`);
  if (entering) countUp(root); else window.scrollTo(0, scrollY);
}


function textVersion(list) {
  const lines = ['*Jadual SPM 2026 · 5 Sigma*', ''];
  let last = '';
  list.forEach(p => {
    const d = rangeText(p);
    if (d !== last) { lines.push('*' + d + '*'); last = d; }
    lines.push('• ' + (p.from ? p.from + '–' + p.to + '  ' : '') + p.name + ', ' + p.paper + ' (' + p.code + ')');
  });
  lines.push('', 'Sumber: Lembaga Peperiksaan, KPM');
  return lines.join('\n');
}

export const spmView = {
  id: 'spm',
  render(el, params, ctx) {
    root = el;
    if (params && params.subject) { v.scope = 'kelas'; v.subject = params.subject; }
    else if (ctx && ctx.entering) v.subject = '';
    paint(!!(ctx && ctx.entering));
    if (el.dataset.wired) return;
    el.dataset.wired = '1';
    on(el, 'click', '[data-scope]', (e, b) => { v.scope = b.dataset.scope; if (v.scope === 'semua') v.subject = ''; paint(false); });
    on(el, 'click', '[data-sf]', (e, b) => { v.subject = b.dataset.sf; paint(false); });
    on(el, 'click', '[data-spm-cal]', async () => {
      const list = classPapers();
      if (onClaude) { toast(await copyText(textVersion(list)) ? 'Jadual SPM disalin. Tampal dalam nota atau kumpulan kelas.' : 'Tidak dapat menyalin di sini.', 'success'); return; }
      const r = await saveFile('jadual-spm-2026-5sigma.ics', icsForPapers(list), 'text/calendar');
      if (r.ok) toast(list.length + ' kertas SPM sedia untuk kalendar', 'success'); else toast(r.message, 'error');
    });
  },
  update(reason) { if (reason === 'tick' || reason === 'session') paint(false); }
};
