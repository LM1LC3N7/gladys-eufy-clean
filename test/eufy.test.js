// -----------------------------------------------------------------------------
// The contract with @mega-yfue/eufy-sdk, checked on the installed version and
// without any network: the names src/eufy.js and src/robot.js rely on. A new
// version that renames one fails here, not on a user's robot.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sdk from '@mega-yfue/eufy-sdk';
import { CONSUMABLES, SUCTION_LEVELS } from '../src/constants.js';
import { RobotOnlyEufy, createEufyClient, isRefusal, sdkLogger } from '../src/eufy.js';
import { normalizeConfig } from '../src/config.js';

test('the SDK exports what the integration uses', () => {
  for (const name of [
    'EufyMega',
    'FileSessionStore',
    'LoginStatus',
    'MegaApiError',
    'SessionExpiredError',
    'VACUUM_CLEAN_MEMBERS',
    'SUCTION_MEMBERS',
    'SuctionLevel',
    'resolveDevice',
  ]) {
    assert.ok(sdk[name], name);
  }
  assert.deepEqual(
    [sdk.LoginStatus.Ok, sdk.LoginStatus.Captcha, sdk.LoginStatus.TwoFactor],
    ['ok', 'captcha', '2fa'],
  );
});

test('the client methods and the two internal ones RobotOnlyEufy replaces exist', () => {
  const proto = sdk.EufyMega.prototype;
  for (const name of [
    'login',
    'solveCaptcha',
    'submitVerifyCode',
    'getDevices',
    'getDevice',
    'waitForRealtime',
    'disconnect',
    'clearSession',
    // Internal, overridden: robots only, no FCM push nor camera P2P.
    'startPush',
    'warmWiredP2P',
  ]) {
    assert.equal(typeof proto[name], 'function', name);
  }
  assert.ok(Object.getPrototypeOf(RobotOnlyEufy.prototype) === proto);
});

test('the robot reads and writes have the names src/robot.js uses', () => {
  const members = Object.keys(sdk.VACUUM_CLEAN_MEMBERS);
  for (const name of [
    'activity',
    'workStatus',
    'chargeState',
    'battery',
    'errorCode',
    'cleanType',
    'cleanExtent',
    'mopLevel',
    'clearTime',
    'clearArea',
    'startCleaning',
    'pauseCleaning',
    'resumeCleaning',
    'returnToDock',
    'setCleanParam',
    ...CONSUMABLES.map((c) => c.member),
  ]) {
    assert.ok(members.includes(name), name);
  }
  assert.equal(sdk.SUCTION_MEMBERS.level.writeAs, 'setSuctionLevel');
  assert.deepEqual(
    SUCTION_LEVELS.map((s) => s.level),
    Object.values(sdk.SuctionLevel),
  );
  assert.deepEqual(sdk.VACUUM_ACTIVITIES, [
    'idle',
    'error',
    'docked',
    'cleaning',
    'returning',
    'paused',
    'unknown',
  ]);
});

test('robot vacuums resolve the robot capabilities; mowers do not (yet)', () => {
  const caps = (model, category) => sdk.resolveDevice({ model, category, params: {} }).capabilities;
  for (const [model, category] of [
    ['T2351', 'eufy_home'],
    ['T2320', 'eufy_home'],
    ['T2267', 'eufy_home_tuya'],
    ['T2250', 'eufy_home_tuya'],
  ]) {
    assert.ok(caps(model, category).includes('vacuum_clean'), model);
    assert.ok(caps(model, category).includes('suction'), model);
  }
  assert.ok(!caps('T2880', 'eufy_home_tuya').includes('vacuum_clean'), 'mower: TODO.md');
});

test('createEufyClient builds a robot-only client without any request', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'eufy-clean-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lines = [];
  const logger = {
    debug: (m) => lines.push(`debug ${m}`),
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
  const config = normalizeConfig({ email: 'a@example.com', password: 'x', country: 'FR' });
  const client = createEufyClient(config, { dataDir: dir, logger });
  assert.ok(client instanceof RobotOnlyEufy);
  assert.equal(client.loggedIn, false);
  assert.equal(client.api.openudid, config.installId, 'our install id, not the SDK default');
  const push = await client.startPush();
  assert.equal(typeof push.close, 'function');
  const readiness = { required: 3, ready: 0, failed: 0, pending: 3 };
  assert.deepEqual(await client.warmWiredP2P(readiness), {
    required: 0,
    ready: 0,
    failed: 0,
    pending: 0,
  });
  await client.disconnect();
  assert.deepEqual(await readdir(dir), [], 'nothing written before a sign-in');
  sdkLogger(logger).error('boom');
  assert.deepEqual(lines.at(-1), 'warn [eufy-sdk] boom');
});

test('isRefusal: refusals stop, network and gateway errors retry', () => {
  const api = (code, status) => new sdk.MegaApiError('/passport/login failed', code, status);
  assert.equal(isRefusal(api(26006, 200)), true);
  assert.equal(isRefusal(api(100006, 400)), true);
  assert.equal(isRefusal(api(10000, 503)), false);
  assert.equal(isRefusal(api(1, 429)), false);
  assert.equal(isRefusal(api(undefined, 200)), false);
  assert.equal(isRefusal(new Error('fetch failed')), false);
  assert.equal(isRefusal(new sdk.SessionExpiredError('kicked')), false);
});
