// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  country: 'FR',
  verification_code: '',
  captcha_answer: '',
  language: 'fr',
};

export const LANGUAGES = ['fr', 'en'];

const hash = (text) => createHash('sha256').update(text).digest('hex');

/** The account a session belongs to, without keeping the e-mail address itself. */
export const accountKey = (email, country) =>
  hash(`${country}:${email.trim().toLowerCase()}`).slice(0, 16);

/**
 * The install identity sent to eufy (`openudid`, 16 hex characters like the
 * SDK's own). The SDK derives one from the e-mail address alone, so two
 * integrations using the same account (this one and eufy Security) would
 * sign each other out: ours is derived from the e-mail address AND this
 * integration's name, stable across restarts.
 */
export const installId = (email) =>
  createHash('md5')
    .update(`gladys-eufy-clean:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);

export function normalizeConfig(raw = {}) {
  const email = String(raw?.email ?? '').trim();
  const password = String(raw?.password ?? '');
  const country = String(raw?.country ?? DEFAULTS.country)
    .trim()
    .toUpperCase();
  const language = String(raw?.language ?? DEFAULTS.language)
    .trim()
    .toLowerCase();
  const countryValid = /^[A-Z]{2}$/.test(country);
  return {
    email,
    password,
    country: countryValid ? country : DEFAULTS.country,
    countryInvalid: !countryValid,
    complete: email !== '' && password !== '',
    account: email === '' ? '' : accountKey(email, country),
    // What a change of must sign in again (the password itself is never kept).
    credentials: hash(`${email.toLowerCase()}\n${password}\n${country}`),
    installId: installId(email),
    // Typed by the user when eufy asks for them; spaces are typing noise.
    code: String(raw?.verification_code ?? '').replace(/\s+/g, ''),
    captcha: String(raw?.captcha_answer ?? '').trim(),
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
  };
}
