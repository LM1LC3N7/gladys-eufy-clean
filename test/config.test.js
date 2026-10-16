import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, accountKey, installId, normalizeConfig } from '../src/config.js';
import { FAULT_CODES, faultText } from '../src/faults.js';
import { fileStore, normalizeMemory } from '../src/store.js';

test('normalizeConfig: defaults, trimming, country and language', () => {
  const empty = normalizeConfig(undefined);
  assert.equal(empty.complete, false);
  assert.equal(empty.country, DEFAULTS.country);
  assert.equal(empty.language, 'fr');
  assert.equal(empty.account, '');
  const config = normalizeConfig({
    email: '  Me@Example.com ',
    password: ' p ',
    country: ' gb',
    verification_code: ' 12 34 56 ',
    captcha_answer: ' x1Y2 ',
    language: 'EN',
  });
  assert.equal(config.email, 'Me@Example.com');
  assert.equal(config.password, ' p ', 'a password is never trimmed');
  assert.equal(config.country, 'GB');
  assert.equal(config.code, '123456');
  assert.equal(config.captcha, 'x1Y2');
  assert.equal(config.language, 'en');
  assert.equal(config.complete, true);
  assert.equal(config.account, accountKey('me@example.com', 'GB'));
  assert.equal(normalizeConfig({ country: 'FRA' }).countryInvalid, true);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'fr');
});

test('a password change is a credentials change, without keeping the password', () => {
  const a = normalizeConfig({ email: 'a@b.c', password: 'one' });
  const b = normalizeConfig({ email: 'a@b.c', password: 'two' });
  assert.notEqual(a.credentials, b.credentials);
  assert.equal(a.account, b.account);
  assert.ok(!a.credentials.includes('one'));
});

test('the install id differs from the SDK default, so eufy Security keeps its session', () => {
  const email = 'robot.owner@example.com';
  // The SDK's own default (MegaHttpClient): md5("eufy-mega:" + email), 16 hex characters.
  const sdkDefault = createHash('md5').update(`eufy-mega:${email}`).digest('hex').slice(0, 16);
  assert.match(installId(email), /^[0-9a-f]{16}$/);
  assert.notEqual(installId(email), sdkDefault);
  assert.equal(installId(' Robot.Owner@example.com'), installId(email), 'stable');
});

test('fault texts', () => {
  assert.equal(faultText(0, 'en'), 'No error');
  assert.equal(faultText(undefined, 'fr'), 'Aucune erreur');
  assert.equal(faultText(2, 'en'), 'Wheel stuck (2)');
  assert.equal(faultText(2, 'fr'), 'Roue bloquée (2)');
  assert.equal(faultText(424242, 'fr'), 'Erreur 424242');
  assert.ok(FAULT_CODES.length > 80);
  for (const code of FAULT_CODES) {
    assert.ok(faultText(code, 'fr').length > 5 && faultText(code, 'en').length > 5);
  }
});

test('the state file: round trip, repair, other account', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'eufy-clean-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = fileStore(join(dir, 'state.json'));
  assert.equal(await store.load(), null);
  await store.save({ account: 'abc', roles: { SN1: ['battery', 'nope', 'state'] } });
  assert.deepEqual(normalizeMemory(await store.load()), {
    account: 'abc',
    roles: { SN1: ['state', 'battery'] },
  });
  assert.deepEqual(normalizeMemory({ roles: { SN1: ['state'] } }), { account: null, roles: {} });
  assert.deepEqual(normalizeMemory('garbage'), { account: null, roles: {} });
});
