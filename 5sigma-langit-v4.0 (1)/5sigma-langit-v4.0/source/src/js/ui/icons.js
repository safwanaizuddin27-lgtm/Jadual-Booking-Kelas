/* One stroked icon set (24px grid, 1.7 stroke). No emoji in the interface:
   the subjects get their own drawn symbols (after the original app's emoji). */

import { raw } from './dom.js';
import { SUBJECT } from '../core/data.js';

const P = {
  utama: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  jadual: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  tempah: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M12 11v6M9 14h6"/>',
  guru: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 4.8a3 3 0 0 1 0 6M17.5 14.2a5.6 5.6 0 0 1 3.5 5.3"/>',
  subjek: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H11v15H6.5A1.5 1.5 0 0 1 5 17.5Z"/><path d="M19 5.5A1.5 1.5 0 0 0 17.5 4H13v15h4.5a1.5 1.5 0 0 0 1.5-1.5Z"/>',
  pengguna: '<circle cx="12" cy="6.5" r="1.6"/><circle cx="5.5" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/><circle cx="8" cy="18.5" r="1.6"/><circle cx="16" cy="18.5" r="1.6"/><path d="M12 8.1 6.7 10.9M12 8.1l5.3 2.8M6.4 13.4 7.4 17M17.6 13.4 16.6 17M9.6 18.5h4.8"/>',
  statistik: '<path d="M5 19V11M10 19V6M15 19v-5M20 19V9"/>',
  kelas: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  tetap: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  tetapan: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9Z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  moon: '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
  spark: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6-5.7-1.8L10.2 9Z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a1 1 0 0 0 1 .9h9a1 1 0 0 0 1-.9L18.5 7M9 7V4.5h6V7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 4.5 4.5L19.5 6.5"/>',
  star: '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 3-5.4 3.6-8.9.2-1 .1-1.9-.2-2.9 3.3 1.3 7.6 5 7.6 10 .8-.6 1.3-1.6 1.4-2.8 1 1.2 1.6 2.6 1.6 4.4C20 18.5 16.6 21 12 21Z"/>',
  display: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  logout: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M16 17l5-5-5-5M21 12H9"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
  whatsapp: '<path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.3 18.6Z"/><path d="M9 9.2c.2 2.2 2 4.5 4.6 5.4l1.4-1.2 1.6.9c-.3 1.2-1.4 1.8-2.6 1.6-3.3-.6-6-3.3-6.4-6.6-.2-1.2.5-2.2 1.6-2.5l.9 1.6Z"/>',
  calplus: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  wand: '<path d="m4 20 11-11M14 4v2M14 10v2M18 6h2M10 6H8M17 3l-1.5 1.5M17 9l-1.5-1.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-30 12 12)"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
  play: '<path d="M8 5v14l11-7Z"/>',
  spm: '<path d="M2.6 9.2 12 4.6l9.4 4.6L12 13.8Z"/><path d="M6.4 11.2v4.6c1.5 1.4 3.4 2.1 5.6 2.1s4.1-.7 5.6-2.1v-4.6"/><path d="M21.4 9.2v5.6"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>'
};

export function icon(name, size, cls) {
  const d = P[name];
  if (!d) return raw('');
  const s = size || 18;
  return raw('<svg class="ico' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>');
}

/* ---------- subject symbols ---------- */
const SUBJ = {
  // Bahasa Melayu: a speaking head (the original app's 🗣️), sound waves in front
  bm: '<path d="M4.4 20.6v-3.2A6.9 6.9 0 0 1 2 12.1a7.3 7.3 0 0 1 7.4-7.3c3.5 0 6.4 2.5 7 5.8l1.2 2.3c.3.5 0 .9-.5.9h-.9v1.8a1.9 1.9 0 0 1-1.9 1.9h-1.7v3.1"/><path d="M19.1 9.6a3.6 3.6 0 0 1 0 4.8"/><path d="M21.2 7.6a6.4 6.4 0 0 1 0 8.8" opacity=".55"/>',
  // English: letterforms "Aa" (the original's 🔤)
  bi: '<path d="M2.8 19 7.4 5.6h1.2L13.2 19"/><path d="M4.6 14.2h6.8"/><circle cx="17.4" cy="15.4" r="3.6"/><path d="M21 11.6V19"/>',
  // Sejarah: a scroll (📜)
  sej: '<rect x="3.6" y="3.2" width="16.8" height="3.6" rx="1.8"/><rect x="3.6" y="17.2" width="16.8" height="3.6" rx="1.8"/><path d="M6.2 6.8v10.4M17.8 6.8v10.4"/><path d="M9.2 10h5.6M9.2 12.8h5.6M9.2 15.4h3.2"/>',
  // Matematik: the four operations
  mat: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.6"/><path d="M8.2 6.4v4.2M6.1 8.5h4.2M13.8 8.5h4.2M6.6 14.1l3.2 3.2M9.8 14.1l-3.2 3.2M13.8 15.7h4.2"/><path d="M15.9 13.3h.01M15.9 18.1h.01" stroke-width="2.4"/>',
  // Pendidikan Islam: a mosque dome with a crescent (🕌)
  pi: '<path d="M3.4 20.6h17.2"/><path d="M5.4 20.6v-6.1h13.2v6.1"/><path d="M5.9 14.5c0-3.3 2.8-5.4 6.1-7 3.3 1.6 6.1 3.7 6.1 7"/><path d="M12 7.5V5.8"/><path d="M13.1 1.8a2.1 2.1 0 1 0 .5 3.6 1.7 1.7 0 1 1-.5-3.6Z"/><path d="M10.4 20.6v-2.4a1.6 1.6 0 0 1 3.2 0v2.4"/>',
  // Pendidikan Moral: a heart held in an open hand (care, values)
  pm: '<path d="M12 11.8S7.3 9.2 7.3 6.1A2.5 2.5 0 0 1 12 4.9a2.5 2.5 0 0 1 4.7 1.2c0 3.1-4.7 5.7-4.7 5.7Z"/><path d="M2.6 15.4h3.3l2.7 1.8h4.3a1.4 1.4 0 0 1 0 2.8H9.4"/><path d="M13.3 18.4 18 15.9a1.5 1.5 0 0 1 1.6 2.5l-5.5 3.2a3 3 0 0 1-1.6.4H2.6"/>',
  // Matematik Tambahan: a function on axes
  am: '<path d="M3.6 3.4v17h17"/><path d="M6.8 5.8c1.3 7 3 10.4 5.3 10.4s4-3.4 5.3-10.4"/><circle cx="12.1" cy="16.2" r="1.35" fill="currentColor" stroke="none"/>',
  // Biologi: a DNA double helix (🧬)
  bio: '<path d="M7 2.8c0 4.7 10 4.5 10 9.2s-10 4.5-10 9.2"/><path d="M17 2.8c0 4.7-10 4.5-10 9.2s10 4.5 10 9.2"/><path d="M8.2 5.2h7.6M9.6 9.6h4.8M9.6 14.4h4.8M8.2 18.8h7.6"/>',
  // Kimia: a conical flask (🧪)
  kim: '<path d="M9.2 3h5.6"/><path d="M10.2 3v6.2L4.9 18a2 2 0 0 0 1.7 3h10.8a2 2 0 0 0 1.7-3l-5.3-8.8V3"/><path d="M7.4 14.6h9.2"/><path d="M10.4 17.6h.01M13.6 18.4h.01M12.4 16.4h.01" stroke-width="2.2"/>',
  // Fizik: an atom (⚛️)
  fiz: '<ellipse cx="12" cy="12" rx="9.6" ry="3.7"/><ellipse cx="12" cy="12" rx="9.6" ry="3.7" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.6" ry="3.7" transform="rotate(-60 12 12)"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
};

function subjectKey(name) { return (SUBJECT[name] && SUBJECT[name].icon) || null; }
// The bare symbol (inherits colour). Falls back to the book icon for an unknown subject.
export function subjectIcon(name, size, cls) {
  const k = subjectKey(name);
  if (!k) return icon('subjek', size, cls);
  const s = size || 18;
  return raw('<svg class="ico sico' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SUBJ[k] + '</svg>');
}
// The symbol in a tinted tile of the subject's colour: <span class="sicon">. Size: sm | md | lg | xl.
export function subjectBadge(name, size, cls) {
  const px = { xs: 13, sm: 15, md: 18, lg: 24, xl: 34 }[size || 'md'] || 18;
  const color = (SUBJECT[name] && SUBJECT[name].color) || '#8C7CFF';
  return raw('<span class="sicon s-' + (size || 'md') + (cls ? ' ' + cls : '') + '" style="--c:' + color + '" aria-hidden="true">' + subjectIcon(name, px).s + '</span>');
}
