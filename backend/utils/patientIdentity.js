// ============================================================
// Patient identity normalisation + duplicate fingerprinting
// ============================================================
// IMPORTANT: matching name + date of birth + mobile number is a
// *duplicate detection* technique only. It is NOT proof of identity and
// must never be used on its own to disclose previous medical records.
// Linking a previous record always requires an authenticated patient
// account (or verified staff action).

const crypto = require('crypto');

// Collapse whitespace, trim and lowercase a person's name.
const normalizeName = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

// Normalise a date of birth to a stable YYYY-MM-DD string (UTC).
const normalizeDob = (dob) => {
  if (!dob) return '';
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

// Keep digits only (country code + local number) so formats don't matter.
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

// Stable, race-safe fingerprint stored on the Patient document (unique index).
const buildDedupeKey = (name, dob, phone) => {
  const n = normalizeName(name);
  const d = normalizeDob(dob);
  const p = normalizePhone(phone);

  if (!n || !d || !p) return null;

  return crypto
    .createHash('sha256')
    .update(`${n}|${d}|${p}`)
    .digest('hex');
};

module.exports = {
  normalizeName,
  normalizeDob,
  normalizePhone,
  buildDedupeKey
};
