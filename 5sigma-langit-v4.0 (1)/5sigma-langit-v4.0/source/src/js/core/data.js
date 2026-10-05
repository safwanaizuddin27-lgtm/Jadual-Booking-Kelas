/* Fixed facts about 5 Sigma: subjects, people, school hours, SPM 2026 dates.
   Subject colours, rosters and teacher assignments are carried over from the
   original app unchanged, so data saved by either version means the same thing. */

export const APP_VERSION = 'v4.0';

// `icon` names a symbol in ui/subject-icons.js (each subject has its own).
export const SUBJECTS = [
  { name: 'Bahasa Melayu',      short: 'BM',  icon: 'bm',  color: '#E11D48', aliases: ['bahasa melayu', 'b melayu', 'bm', 'melayu', 'malay', 'bahasa malaysia'] },
  { name: 'English',            short: 'BI',  icon: 'bi',  color: '#4F46E5', aliases: ['english', 'bahasa inggeris', 'bahasa inggris', 'inggeris', 'bi', 'eng'] },
  { name: 'Sejarah',            short: 'SEJ', icon: 'sej', color: '#B45309', aliases: ['sejarah', 'history', 'sej'] },
  { name: 'Matematik',          short: 'MAT', icon: 'mat', color: '#2563EB', aliases: ['matematik', 'mathematics', 'maths', 'math', 'mate', 'mat', 'mm'] },
  { name: 'Pendidikan Islam',   short: 'PI',  icon: 'pi',  color: '#0D9488', aliases: ['pendidikan islam', 'p islam', 'agama islam', 'agama', 'islam', 'pi'] },
  { name: 'Pendidikan Moral',   short: 'PM',  icon: 'pm',  color: '#C026D3', aliases: ['pendidikan moral', 'p moral', 'moral', 'pm'] },
  { name: 'Matematik Tambahan', short: 'AM',  icon: 'am',  color: '#0284C7', aliases: ['matematik tambahan', 'math tambahan', 'add maths', 'add math', 'addmaths', 'addmath', 'add mate', 'addmate', 'mate tambahan', 'mt', 'am'] },
  { name: 'Biologi',            short: 'BIO', icon: 'bio', color: '#EA580C', aliases: ['biologi', 'biology', 'bio'] },
  { name: 'Kimia',              short: 'KIM', icon: 'kim', color: '#16A34A', aliases: ['kimia', 'chemistry', 'chem', 'kim'] },
  { name: 'Fizik',              short: 'FIZ', icon: 'fiz', color: '#7C3AED', aliases: ['fizik', 'physics', 'fiz', 'phy', 'physic'] }
];
export const SUBJECT = Object.fromEntries(SUBJECTS.map(s => [s.name, s]));
export function subjectColor(name) { return (SUBJECT[name] && SUBJECT[name].color) || '#8C7CFF'; }
export function subjectShort(name) { return (SUBJECT[name] && SUBJECT[name].short) || String(name).slice(0, 3).toUpperCase(); }

// As saved in the original app's Firestore config (Fizik: Cikgu Norhani since 22 Sep 2026).
export const DEFAULT_SUBJECT_TEACHERS = {
  'Bahasa Melayu': 'Cikgu Tiong',
  'English': 'Teacher Hasyimah',
  'Matematik': 'Cikgu Azurah',
  'Sejarah': 'Cikgu Loh',
  'Pendidikan Islam': 'Ustazah Syarfanezha',
  'Pendidikan Moral': 'Cikgu Dylan',
  'Matematik Tambahan': 'Miss Dayang',
  'Biologi': 'Madam Patricia',
  'Fizik': 'Cikgu Norhani',
  'Kimia': 'Cikgu Azurah'
};

/* The admin account. The admin code is never written here: the page keeps
   only a salted, slow hash of it (see core/sha256.js), so it cannot be read
   from the source. The check still runs in the browser, so it keeps admin
   tools out of everyday hands; a server-side check is the stronger lock. */
export const ADMIN_USER = 'SAFWAN';
export const ADMIN_CODE = {
  salt: '039576046f01b5f9f6a942193813a7ae',
  rounds: 20000,
  check: '14a27b1cabc58341663c87c1715604226410259a1de36af80db251e4f7312565'
};

export const STUDENT_NAMES = ['ADRIN', 'ALEEYSHA', 'DEA', 'HUSNA', 'IVY', 'KAETLYNN', 'KHAERA', 'AKIM', 'YASIN', 'SAFWAN', 'NATHANEIL', 'HAZARINNA', 'OCFREATY'];

// Subjects where only part of the class attends. Everything else is the full class.
export const SUBJECT_ROSTERS = {
  'Pendidikan Islam': ['ALEEYSHA', 'DEA', 'HUSNA', 'KHAERA', 'AKIM', 'YASIN', 'SAFWAN', 'HAZARINNA'],
  'Pendidikan Moral': ['ADRIN', 'IVY', 'KAETLYNN', 'NATHANEIL', 'OCFREATY']
};
// These two run at the same time by design, so they never count as a clash.
export const EXEMPT_PAIRS = [['Pendidikan Islam', 'Pendidikan Moral']];

export const JS_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_MY = { Sunday: 'Ahad', Monday: 'Isnin', Tuesday: 'Selasa', Wednesday: 'Rabu', Thursday: 'Khamis', Friday: 'Jumaat', Saturday: 'Sabtu' };
export const MONTHS_MY = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];

/* The normal school timetable owns these hours. No booking exists for them,
   and "nothing booked" there never means "free". */
export const SCHOOL_HOURS = {
  Monday: { from: '07:00', to: '13:00' },
  Tuesday: { from: '07:00', to: '13:00' },
  Wednesday: { from: '07:00', to: '13:00' },
  Thursday: { from: '07:00', to: '13:00' },
  Friday: { from: '07:00', to: '11:30' }
};
// Friday prayers: most of the class is at the mosque, so the slot finder avoids it.
export const FRIDAY_PRAYER = { from: '12:15', to: '14:15' };
export const ANALYSIS_END = '18:00';     // the original insight rule: analyse availability up to 6 pm

// The timetable grid covers the whole day, as in the original app (00:00 to 24:00).
export const GRID_FROM = 0;
export const GRID_TO = 24 * 60;

/* ==========================================================================
   SPM 2026 — Jadual Waktu Peperiksaan Sijil Pelajaran Malaysia 2026,
   Lembaga Peperiksaan, KPM (18 Ogos 2026).
   Every paper is listed. `subject` links a paper to one of this class's
   subjects; papers of other subjects have subject null.
   ========================================================================== */
const PAPERS = [
  // date, dateTo, from, to, code, name, paper, class subject, kind
  ['2026-10-26', '2026-10-29', '', '', '1103/3', 'Bahasa Melayu', 'Kertas 3 · Ujian Bertutur', 'Bahasa Melayu', 'lisan'],
  ['2026-11-02', '2026-11-05', '', '', '1119/3', 'Bahasa Inggeris', 'Kertas 3 · Ujian Bertutur', 'English', 'lisan'],
  ['2026-11-16', '', '', '', '4531/3', 'Fizik', 'Kertas 3 · Ujian Amali', 'Fizik', 'amali'],
  ['2026-11-17', '', '', '', '4541/3', 'Kimia', 'Kertas 3 · Ujian Amali', 'Kimia', 'amali'],
  ['2026-11-18', '', '', '', '4551/3', 'Biologi', 'Kertas 3 · Ujian Amali', 'Biologi', 'amali'],
  ['2026-11-18', '', '', '', '4561/3', 'Sains Tambahan', 'Kertas 3 · Ujian Amali', null, 'amali'],

  ['2026-11-23', '', '09:00', '09:30', '1103/4', 'Bahasa Melayu', 'Kertas 4 · Ujian Mendengar', 'Bahasa Melayu', 'mendengar'],
  ['2026-11-23', '', '10:45', '12:45', '1103/1', 'Bahasa Melayu', 'Kertas 1', 'Bahasa Melayu'],
  ['2026-11-23', '', '14:30', '17:00', '1103/2', 'Bahasa Melayu', 'Kertas 2', 'Bahasa Melayu'],

  ['2026-11-24', '', '09:00', '09:40', '1119/4', 'Bahasa Inggeris', 'Kertas 4 · Ujian Mendengar', 'English', 'mendengar'],
  ['2026-11-24', '', '11:00', '12:30', '1119/1', 'Bahasa Inggeris', 'Kertas 1', 'English'],
  ['2026-11-24', '', '14:30', '16:00', '1119/2', 'Bahasa Inggeris', 'Kertas 2', 'English'],

  ['2026-11-25', '', '08:15', '10:30', '5402/1', 'Al-Syariah', 'Kertas 1', null],
  ['2026-11-25', '', '08:15', '10:45', '1223/1', 'Pendidikan Islam', 'Kertas 1', 'Pendidikan Islam'],
  ['2026-11-25', '', '08:15', '10:45', '1225', 'Pendidikan Moral', 'Kertas tunggal', 'Pendidikan Moral'],
  ['2026-11-25', '', '08:15', '10:45', '5228', "Pendidikan Syari'ah Islamiah", 'Kertas tunggal', null],
  ['2026-11-25', '', '08:15', '10:45', '5304/1', 'Turath Dirasat Islamiah', 'Kertas 1', null],
  ['2026-11-25', '', '14:30', '16:00', '5302/2', 'Maharat Al-Quran', 'Kertas 2', null],
  ['2026-11-25', '', '14:30', '17:00', '3729/1', 'Pertanian', 'Kertas 1', null],

  ['2026-11-26', '', '08:15', '09:45', '1449/1', 'Matematik', 'Kertas 1', 'Matematik'],
  ['2026-11-26', '', '10:45', '13:15', '1449/2', 'Matematik', 'Kertas 2', 'Matematik'],

  ['2026-11-30', '', '08:15', '09:15', '1249/1', 'Sejarah', 'Kertas 1', 'Sejarah'],
  ['2026-11-30', '', '10:30', '13:00', '1249/2', 'Sejarah', 'Kertas 2', 'Sejarah'],
  ['2026-11-30', '', '14:30', '17:00', '5226', 'Tasawwur Islam', 'Kertas tunggal', null],

  ['2026-12-01', '', '08:15', '10:30', '5404/1', "Manahij al-'Ulum al-Islamiah", 'Kertas 1', null],
  ['2026-12-01', '', '08:15', '11:15', '2611/2', 'Pendidikan Seni Visual', 'Kertas 2 · Ujian Melukis', null],
  ['2026-12-01', '', '12:00', '13:00', '2611/1', 'Pendidikan Seni Visual', 'Kertas 1 · Teori Seni', null],
  ['2026-12-01', '', '14:30', '16:00', '2621/1', 'Pendidikan Muzik', 'Kertas 1', null],
  ['2026-12-01', '', '14:30', '17:00', '3763/1', 'Reka Cipta', 'Kertas 1', null],

  ['2026-12-02', '', '08:15', '09:30', '4551/1', 'Biologi', 'Kertas 1', 'Biologi'],
  ['2026-12-02', '', '08:15', '09:30', '3766/1', 'Perniagaan', 'Kertas 1', null],
  ['2026-12-02', '', '10:45', '13:15', '4551/2', 'Biologi', 'Kertas 2', 'Biologi'],
  ['2026-12-02', '', '10:45', '13:00', '3766/2', 'Perniagaan', 'Kertas 2', null],
  ['2026-12-02', '', '14:30', '17:00', '3766/4', 'Perniagaan', 'Kertas 4', null],

  ['2026-12-03', '', '08:15', '09:30', '4531/1', 'Fizik', 'Kertas 1', 'Fizik'],
  ['2026-12-03', '', '08:15', '09:30', '1511/1', 'Sains', 'Kertas 1', null],
  ['2026-12-03', '', '10:30', '13:00', '4531/2', 'Fizik', 'Kertas 2', 'Fizik'],
  ['2026-12-03', '', '10:30', '13:00', '1511/2', 'Sains', 'Kertas 2', null],
  ['2026-12-03', '', '14:30', '17:00', '3769/1', 'Sains Rumah Tangga', 'Kertas 1', null],

  ['2026-12-07', '', '08:15', '09:30', '3767/1', 'Ekonomi', 'Kertas 1', null],
  ['2026-12-07', '', '10:45', '13:00', '3767/2', 'Ekonomi', 'Kertas 2', null],
  ['2026-12-07', '', '14:30', '16:30', '7101/1–7110/1', 'Mata pelajaran vokasional (binaan, elektrik, mekanikal)', 'Kertas 1', null],
  ['2026-12-07', '', '14:30', '17:00', '7201/1–7407/1', 'Mata pelajaran vokasional (lain-lain)', 'Kertas 1', null],
  ['2026-12-07', '', '14:30', '17:00', '3759/1', 'Lukisan Kejuruteraan', 'Kertas 1', null],
  ['2026-12-07', '', '14:30', '17:00', '3771/1', 'Grafik Komunikasi Teknikal', 'Kertas 1', null],

  ['2026-12-08', '', '08:15', '10:00', '6351/1', 'Bahasa Cina', 'Kertas 1', null],
  ['2026-12-08', '', '08:15', '10:00', '6354/1', 'Bahasa Tamil', 'Kertas 1', null],
  ['2026-12-08', '', '08:15', '10:00', '6356/1', 'Bahasa Iban', 'Kertas 1', null],
  ['2026-12-08', '', '08:15', '10:00', '6357/1', 'Bahasa Kadazandusun', 'Kertas 1', null],
  ['2026-12-08', '', '08:15', '10:00', '6358', 'Bahasa Semai', 'Kertas tunggal', null],
  ['2026-12-08', '', '08:15', '10:45', '5403/1', "Al-Lughah al-'Arabiah", 'Kertas 1', null],
  ['2026-12-08', '', '08:15', '10:45', '2361/1', 'Bahasa Arab', 'Kertas 1', null],
  ['2026-12-08', '', '08:15', '10:45', '5305/1', 'Turath Bahasa Arab', 'Kertas 1', null],
  ['2026-12-08', '', '14:30', '16:45', '6351/2', 'Bahasa Cina', 'Kertas 2', null],
  ['2026-12-08', '', '14:30', '16:45', '6354/2', 'Bahasa Tamil', 'Kertas 2', null],
  ['2026-12-08', '', '14:30', '16:45', '6356/2', 'Bahasa Iban', 'Kertas 2', null],
  ['2026-12-08', '', '14:30', '16:45', '6357/2', 'Bahasa Kadazandusun', 'Kertas 2', null],

  ['2026-12-09', '', '08:15', '09:30', '4572/1', 'Sains Sukan', 'Kertas 1', null],
  ['2026-12-09', '', '08:15', '10:30', '5401/1', 'Usul al-Din', 'Kertas 1', null],
  ['2026-12-09', '', '10:30', '13:00', '4572/2', 'Sains Sukan', 'Kertas 2', null],
  ['2026-12-09', '', '14:30', '17:00', '3754/1', 'Keusahawanan', 'Kertas 1', null],
  ['2026-12-09', '', '14:30', '17:00', '3760/1', 'Kejuruteraan Mekanikal', 'Kertas 1', null],
  ['2026-12-09', '', '14:30', '17:00', '3761/1', 'Kejuruteraan Awam', 'Kertas 1', null],
  ['2026-12-09', '', '14:30', '17:00', '3762/1', 'Kejuruteraan Elektrik dan Elektronik', 'Kertas 1', null],
  ['2026-12-09', '', '14:30', '17:00', '3768/1', 'Asas Kelestarian', 'Kertas 1', null],

  ['2026-12-10', '', '08:15', '10:15', '9221', 'Bible Knowledge', 'Kertas tunggal', null],
  ['2026-12-10', '', '08:15', '10:15', '9378', 'Bahasa Punjabi', 'Kertas tunggal', null],
  ['2026-12-10', '', '08:15', '10:45', '5227/1', 'Pendidikan Al-Quran dan Al-Sunnah', 'Kertas 1', null],
  ['2026-12-10', '', '08:15', '10:45', '5303/1', 'Turath Al-Quran dan Al-Sunnah', 'Kertas 1', null],
  ['2026-12-10', '', '14:30', '17:00', '3770/1', 'Sains Komputer', 'Kertas 1', null],

  ['2026-12-14', '', '08:15', '09:30', '3756/1', 'Prinsip Perakaunan', 'Kertas 1', null],
  ['2026-12-14', '', '10:45', '13:15', '3756/2', 'Prinsip Perakaunan', 'Kertas 2', null],
  ['2026-12-14', '', '14:30', '16:45', '5405/1', 'Al-Adab wa al-Balaghah', 'Kertas 1', null],
  ['2026-12-14', '', '14:30', '17:00', '3756/4', 'Prinsip Perakaunan', 'Kertas 4', null],

  ['2026-12-15', '', '08:15', '09:30', '4541/1', 'Kimia', 'Kertas 1', 'Kimia'],
  ['2026-12-15', '', '08:15', '09:30', '4561/1', 'Sains Tambahan', 'Kertas 1', null],
  ['2026-12-15', '', '10:45', '13:15', '4541/2', 'Kimia', 'Kertas 2', 'Kimia'],
  ['2026-12-15', '', '10:45', '13:15', '4561/2', 'Sains Tambahan', 'Kertas 2', null],

  ['2026-12-16', '', '08:15', '10:45', '2206', 'Kesusasteraan Inggeris', 'Kertas tunggal', null],
  ['2026-12-16', '', '08:15', '10:45', '2216/1', 'Kesusasteraan Melayu Komunikatif', 'Kertas 1', null],
  ['2026-12-16', '', '08:15', '10:45', '9216', 'Kesusasteraan Cina', 'Kertas tunggal', null],
  ['2026-12-16', '', '08:15', '10:45', '9217', 'Kesusasteraan Tamil', 'Kertas tunggal', null],
  ['2026-12-16', '', '11:45', '13:00', '2280/1', 'Geografi', 'Kertas 1', null],
  ['2026-12-16', '', '14:30', '17:00', '2280/2', 'Geografi', 'Kertas 2', null],

  ['2026-12-17', '', '08:15', '10:15', '3472/1', 'Matematik Tambahan', 'Kertas 1', 'Matematik Tambahan'],
  ['2026-12-17', '', '14:30', '17:00', '3472/2', 'Matematik Tambahan', 'Kertas 2', 'Matematik Tambahan']
].map(([date, dateTo, from, to, code, name, paper, subject, kind]) => ({ date, dateTo: dateTo || date, from, to, code, name, paper, subject: subject || null, kind: kind || 'bertulis' }));

export const SPM = {
  year: 2026,
  source: 'Jadual Waktu Peperiksaan SPM 2026, Lembaga Peperiksaan KPM (18 Ogos 2026)',
  writtenStart: '2026-11-23',
  writtenEnd: '2026-12-17',
  papers: PAPERS,
  // The class's milestones before the written papers. Each science practical has its own day.
  milestones: [
    { id: 'bm-oral', label: 'Ujian Bertutur Bahasa Melayu', short: 'Bertutur BM', from: '2026-10-26', to: '2026-10-29', subjects: ['Bahasa Melayu'] },
    { id: 'bi-oral', label: 'Ujian Bertutur Bahasa Inggeris', short: 'Bertutur BI', from: '2026-11-02', to: '2026-11-05', subjects: ['English'] },
    { id: 'amali-fiz', label: 'Ujian Amali Fizik', short: 'Amali Fizik', from: '2026-11-16', to: '2026-11-16', subjects: ['Fizik'] },
    { id: 'amali-kim', label: 'Ujian Amali Kimia', short: 'Amali Kimia', from: '2026-11-17', to: '2026-11-17', subjects: ['Kimia'] },
    { id: 'amali-bio', label: 'Ujian Amali Biologi', short: 'Amali Biologi', from: '2026-11-18', to: '2026-11-18', subjects: ['Biologi'] },
    { id: 'written', label: 'Peperiksaan Bertulis SPM', short: 'SPM bertulis', from: '2026-11-23', to: '2026-12-17', subjects: [] }
  ]
};
// This class's papers (oral and practical tests included), in date and time order.
export const CLASS_PAPERS = PAPERS.filter(p => p.subject).sort((a, b) => (a.date + (a.from || '00:00')).localeCompare(b.date + (b.from || '00:00')));
export function papersOf(subject) { return CLASS_PAPERS.filter(p => p.subject === subject); }

export const ATT_STATUSES = [
  { id: 'hadir', label: 'Hadir', short: 'H', tone: 'live' },
  { id: 'lewat', label: 'Lewat', short: 'L', tone: 'warn' },
  { id: 'dikecualikan', label: 'Dikecualikan', short: 'D', tone: 'info' },
  { id: 'tidak', label: 'Tidak hadir', short: 'T', tone: 'danger' }
];
export const ATT_LABEL = Object.fromEntries(ATT_STATUSES.map(s => [s.id, s.label]));

export const STATUS_LABELS = {
  upcoming: 'Akan datang',
  ongoing: 'Sedang berlangsung',
  extending: 'Sedang extend',
  ended: 'Selesai',
  cancelled: 'Dibatalkan'
};

export const SESSION_KEY = 'jadual-sandbox-session';
export const THEME_KEY = 'jadual-sandbox-theme';
// v2: the store now starts from the real data of the original site (v1 held generated demo data).
export const DB_KEY = 'langit5s-db-v2';
export const OLD_DB_KEYS = ['langit5s-db-v1'];
export const SOURCE_KEY = 'langit5s-source';
