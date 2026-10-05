/* Where the app is running, and what that host lets it do.
   On claude.ai the page is framed: file downloads go through the `downloads`
   capability and Tanya Sigma can ask Claude through `sample`. Anywhere else
   (GitHub Pages, Netlify, opened from disk) normal browser APIs are used. */

export const onClaude = !!(window.claude && typeof window.claude.use === 'function') ||
  !!document.querySelector('meta[name="langit-host"][content="artifact"]');

let samplePromise = null, downloadsPromise = null;
function use(name) {
  try { return (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null); }
  catch (e) { return Promise.resolve(null); }
}
export function getSample() { if (!samplePromise) samplePromise = use('sample'); return samplePromise; }
export function getDownloads() { if (!downloadsPromise) downloadsPromise = use('downloads'); return downloadsPromise; }

// Save a generated file. Returns {ok, message}.
export async function saveFile(filename, text, mime) {
  if (onClaude) {
    const dl = await getDownloads();
    if (!dl) return { ok: false, message: 'Muat turun tidak tersedia di sini. Gunakan butang Salin.' };
    try { await dl.save({ filename, data: text }); return { ok: true }; }
    catch (e) { return { ok: false, message: e && e.code === 'declined' ? 'Muat turun dibatalkan.' : 'Fail ini tidak dapat dimuat turun di sini. Gunakan butang Salin.' }; }
  }
  try {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return { ok: true };
  } catch (e) { return { ok: false, message: 'Muat turun gagal.' }; }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (err) { return false; }
  }
}
