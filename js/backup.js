// Verschlüsselte Sicherungsdatei: AES-256-GCM, Schlüssel per PBKDF2-SHA-256 aus einem eigenen Passwort.
// Ohne Passwort ist die Datei nicht lesbar – auch dann nicht, wenn sie in falsche Hände gerät.
const ITER = 600000, MIN_ITER = 100000, MAX_ITER = 5000000;
const enc = new TextEncoder(), dec = new TextDecoder();
export const KIND = 'backup-encrypted';

const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

async function deriveKey(password, salt, iterations, usage) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}

export function isEncrypted(raw) { return raw?.app === 'KlassenKompass' && raw.kind === KIND; }

// text: unverschlüsselte Sicherung (JSON-Text) → verschlüsselte Sicherung (JSON-Text)
export async function encrypt(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return JSON.stringify({ app: 'KlassenKompass', kind: KIND, v: 1, exportedAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2-SHA-256', iterations: ITER, salt: b64(salt) }, cipher: 'AES-256-GCM', iv: b64(iv), data: b64(ct) });
}

// raw: eingelesene verschlüsselte Sicherung (Objekt) → unverschlüsselter JSON-Text
export async function decrypt(raw, password) {
  const it = Number(raw?.kdf?.iterations);
  if (raw?.v !== 1 || !Number.isInteger(it) || it < MIN_ITER || it > MAX_ITER || !raw.kdf.salt || !raw.iv || !raw.data) throw new Error('Die verschlüsselte Sicherung ist beschädigt oder stammt aus einer neueren Version.');
  try {
    const key = await deriveKey(password, unb64(raw.kdf.salt), it, ['decrypt']);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(raw.iv) }, key, unb64(raw.data)));
  } catch { throw new Error('Falsches Passwort oder beschädigte Datei.'); }
}
