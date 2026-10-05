/* Small building blocks shared by the directory, analytics and admin pages. */

import { html } from '../ui/dom.js';
import { raw } from '../ui/dom.js';
import { subjectBadge } from '../ui/icons.js';
import { initials } from '../core/util.js';
import { subjectColor } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { dayLabel } from '../ui/format.js';
import { durationText } from '../ui/format.js';
import { statusPill } from './actions.js';

// A class as a row: colour bar, subject, teacher, when, status. Opens the class sheet.
export function classRows(list, n, opts) {
  opts = opts || {};
  if (!list.length) return html`<div class="empty"><b>${opts.empty || 'Tiada kelas'}</b>${opts.emptyHint ? html`<p>${opts.emptyHint}</p>` : ''}</div>`;
  return html`<div class="cl-list">${list.map(b => {
    const st = computeStatus(b, n);
    return html`<button type="button" class="cl-row st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
      ${subjectBadge(b.subject, 'md')}
      <span class="cl-main"><b>${opts.title ? opts.title(b) : b.subject}</b><span>${opts.sub ? opts.sub(b) : b.teacher + (b.notes ? ' · ' + b.notes : '')}</span></span>
      <span class="cl-when"><b>${dayLabel(b.date, n)}</b><span>${b.from}–${b.to} · ${durationText(b.from, b.to)}</span></span>
      ${st !== 'upcoming' ? statusPill(st) : ''}</button>`;
  })}</div>`;
}

// A plain table: columns are {label, get(row) -> html|string, cls}.
export function table(rows, cols, opts) {
  opts = opts || {};
  if (!rows.length) return html`<div class="empty"><b>${opts.empty || 'Tiada rekod lagi'}</b></div>`;
  return html`<div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => html`<th class="${c.cls || ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map(r => html`<tr>${cols.map(c => html`<td class="${c.cls || ''}">${c.get(r)}</td>`)}</tr>`)}</tbody></table></div>`;
}

// Tiny line chart for a KPI card.
export function sparkline(series, color) {
  if (!series || series.length < 2) return '';
  const max = Math.max(1, ...series), w = 100, h = 28;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 2 - (v / max) * (h - 6)]);
  const line = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = '0,' + h + ' ' + line + ' ' + w + ',' + h;
  return html`<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" style="--c:${color || 'var(--gold)'}">
    <polygon points="${area}" class="spark-area"/><polyline points="${line}" class="spark-line" pathLength="100"/></svg>`;
}

export function kpi(label, value, opts) {
  opts = opts || {};
  return html`<div class="kpi${opts.tone ? ' t-' + opts.tone : ''}">
    <span class="kpi-label">${opts.icon || ''}${label}</span>
    <b class="kpi-value"${typeof value === 'number' ? raw(' data-count="' + value + '"') : ''}>${value}</b>
    ${opts.sub ? html`<span class="kpi-sub">${opts.sub}</span>` : ''}
    ${opts.series ? sparkline(opts.series, opts.color) : ''}
  </div>`;
}

export function avatar(name, color, size) {
  return html`<span class="av" style="--c:${color || 'var(--gold)'};--s:${size || 44}px" aria-hidden="true">${initials(name)}</span>`;
}

// Horizontal bars, largest first.
export function bars(entries, opts) {
  opts = opts || {};
  if (!entries.length) return html`<p class="muted">Tiada data lagi.</p>`;
  const max = Math.max(1, ...entries.map(e => e.value));
  return html`<div class="hbars">${entries.map((e, i) => html`<div class="hbar" style="--c:${e.color || 'var(--gold)'};--w:${(e.value / max * 100).toFixed(1)}%;--i:${i}">
    <span class="hbar-label" title="${e.label}">${e.icon || ''}${e.label}</span><span class="hbar-track"><i></i></span><span class="hbar-value">${opts.format ? opts.format(e.value) : e.value}</span></div>`)}</div>`;
}
