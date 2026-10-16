// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys and a fake eufy cloud behind the client factory. Timers and Date are
// mocked: the tests move the clock like the scheduler sees it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EufyCleanApp } from '../src/app.js';
import { accountKey } from '../src/config.js';
import { ACTIONS, GLADYS, SCENE_TRIGGERS, TIMINGS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import { CAPTCHA, CAPTCHA_IMAGE, CODE, EMAIL, L60, PASSWORD, X10 } from './fixtures/robots.js';
import { ApiError, ExpiredError, fakeEufy, memoryStore, settle } from './helpers/fakeEufy.js';

const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
const CONFIG = { email: EMAIL, password: PASSWORD, country: 'FR', language: 'en' };
const robot = (sn) => `ext:test-integration:robot:${sn}`;
const { VACUUM_STATE: STATE, VACUUM_RUN_MODE: RUN, VACUUM_CLEAN_MODE: MODE } = GLADYS;

function captureLogger() {
  const lines = [];
  const log =
    (level) =>
    (message, ...args) =>
      lines.push(`${level} ${message} ${args.map((a) => a?.message ?? String(a)).join(' ')}`);
  return { lines, debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

async function setup(
  t,
  {
    config = CONFIG,
    factory = fakeEufy({ needsCode: false }),
    store = memoryStore(),
    devices,
  } = {},
) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: NOW });
  const gladys = createFakeGladys({ config, devices });
  const logger = captureLogger();
  const app = new EufyCleanApp({
    gladys,
    logger,
    createClient: factory,
    store,
    dataDir: '/tmp/unused',
    now: () => Date.now(),
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  await settle();
  t.after(() => app.stop());
  const advance = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      t.mock.timers.tick(1000);
      await settle();
    }
  };
  return { gladys, app, world: factory.world, store, logger, advance };
}

const deviceOf = (gladys, sn) =>
  gladys.fake.discoveredDevices.find((d) => d.external_id === robot(sn));
const featureOf = (gladys, sn, role) =>
  deviceOf(gladys, sn).features.find((f) => f.external_id === `${robot(sn)}:${role}`);
const roles = (gladys, sn) =>
  deviceOf(gladys, sn).features.map((f) => f.external_id.split(':').at(-1));
const create = async (gladys, ...sns) => {
  for (const sn of sns) {
    await gladys.fake.deviceCreated(deviceOf(gladys, sn));
  }
  await settle();
};
const last = (gladys, sn, role) => gladys.fake.lastState(`${robot(sn)}:${role}`);
const set = (gladys, sn, role, value) =>
  gladys.fake.setValue(deviceOf(gladys, sn), featureOf(gladys, sn, role), value);
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((e) => e.key === key);
const status = (gladys) => gladys.fake.connectionStatus;

test('without credentials, the status asks for them and no client is built', async (t) => {
  const factory = fakeEufy();
  const { gladys, world } = await setup(t, { config: {}, factory });
  assert.equal(world.clients.length, 0);
  assert.equal(status(gladys).connected, false);
  assert.match(status(gladys).message.en, /e-mail address and password/);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /Non connecté : Saisissez/);
});

test('a country that is not two letters is refused before any sign-in', async (t) => {
  const factory = fakeEufy();
  const { gladys, world } = await setup(t, { config: { ...CONFIG, country: 'France' }, factory });
  assert.equal(world.clients.length, 0);
  assert.match(status(gladys).message.en, /two-letter code/);
});

test('the client gets the account, its own install id, the country and /data', async (t) => {
  const factory = fakeEufy({ needsCode: false });
  const { world } = await setup(t, { config: { ...CONFIG, country: ' be ' }, factory });
  const client = world.client();
  assert.equal(client.config.email, EMAIL);
  assert.equal(client.config.password, PASSWORD);
  assert.equal(client.config.country, 'BE');
  assert.match(client.config.installId, /^[0-9a-f]{16}$/);
  assert.equal(client.options.dataDir, '/tmp/unused');
});

test('first sign-in with a verification code typed in the configuration', async (t) => {
  const factory = fakeEufy({ needsCode: true });
  const { gladys, world } = await setup(t, { factory });
  assert.equal(world.codesSent, 1);
  assert.equal(status(gladys).connected, false);
  assert.match(status(gladys).message.en, /verification code/);
  assert.equal(gladys.fake.discoveredDevices.length, 0);

  // A wrong code: eufy refuses it, a new one is sent.
  await gladys.fake.configUpdated({ ...CONFIG, verification_code: '000 000' });
  await settle();
  assert.deepEqual(world.codes, ['000000'], 'spaces are typing noise');
  assert.equal(world.codesSent, 2);
  assert.match(status(gladys).message.en, /refused the verification code/);
  assert.equal(gladys.fake.config.verification_code, '', 'the field empties itself');

  await gladys.fake.configUpdated({ ...CONFIG, verification_code: CODE });
  await settle();
  assert.deepEqual(world.codes, ['000000', CODE]);
  assert.equal(world.clients.length, 1, 'the same pending sign-in, no new client');
  assert.equal(status(gladys).connected, true);
  assert.match(status(gladys).message.en, /Connected to eufy: 2 robots/);
  assert.equal(gladys.fake.config.verification_code, '');
});

test('a captcha: the image goes to the logs, the answer through the configuration', async (t) => {
  const factory = fakeEufy({ needsCaptcha: true, needsCode: false });
  const { gladys, world, logger } = await setup(t, { factory });
  assert.match(status(gladys).message.en, /captcha/);
  assert.ok(
    logger.lines.some((l) => l.includes(CAPTCHA_IMAGE)),
    'the image is in the logs',
  );

  await gladys.fake.configUpdated({ ...CONFIG, captcha_answer: 'zzzz' });
  await settle();
  assert.match(status(gladys).message.en, /Wrong captcha answer/);
  await gladys.fake.configUpdated({ ...CONFIG, captcha_answer: ` ${CAPTCHA} ` });
  await settle();
  assert.deepEqual(world.answers, ['zzzz', CAPTCHA]);
  assert.equal(status(gladys).connected, true);
  assert.equal(gladys.fake.config.captcha_answer, '');
});

test('a code left in the form from an earlier sign-in is not sent again', async (t) => {
  const factory = fakeEufy({ needsCode: true });
  const { gladys, world } = await setup(t, {
    config: { ...CONFIG, verification_code: '999999' },
    factory,
  });
  assert.deepEqual(world.codes, []);
  assert.match(status(gladys).message.en, /verification code/);
});

test('a refused password stops until the configuration changes', async (t) => {
  const factory = fakeEufy({ needsCode: false });
  factory.world.failures.push(
    new ApiError('/passport/login failed (200/26006): password error', 26006),
  );
  const { gladys, world, logger, advance } = await setup(t, { factory });
  assert.equal(status(gladys).connected, false);
  assert.match(status(gladys).message.en, /refused the sign-in/);
  await advance(30 * 60_000);
  assert.equal(world.logins, 1, 'no automatic retry');
  assert.ok(!logger.lines.some((l) => l.includes(PASSWORD)), 'the password is never logged');
  await gladys.fake.configUpdated({ ...CONFIG, password: 'new password' });
  await settle();
  assert.equal(world.clients.length, 2);
  assert.equal(status(gladys).connected, true);
});

test('eufy unreachable: retries after 1, 2, 4… minutes', async (t) => {
  const factory = fakeEufy({ needsCode: false });
  factory.world.failures.push(new Error('fetch failed'), new Error('fetch failed'));
  const { gladys, world, advance } = await setup(t, { factory });
  assert.match(status(gladys).message.en, /next try in 1 min/);
  await advance(60_000);
  assert.equal(world.logins, 2);
  assert.match(status(gladys).message.en, /next try in 2 min/);
  await advance(119_000);
  assert.equal(world.logins, 2);
  await advance(1_000);
  assert.equal(world.logins, 3);
  assert.equal(status(gladys).connected, true);
});

test('a stored session signs in without a code; another account starts afresh', async (t) => {
  const factory = fakeEufy({ needsCode: true, sessionStored: true });
  const store = memoryStore({ account: accountKey(EMAIL, 'FR'), roles: {} });
  const { gladys, world } = await setup(t, { factory, store });
  assert.equal(world.codesSent, 0);
  assert.equal(world.cleared, 0, 'the session of this account is kept');
  assert.equal(status(gladys).connected, true);

  await gladys.fake.configUpdated({ ...CONFIG, email: 'other@example.com' });
  await settle();
  assert.equal(world.cleared, 1, 'another account: the stored session is dropped');
  assert.equal(world.codesSent, 1);
  assert.equal(store.data.account, accountKey('other@example.com', 'FR'));
});

test('robot vacuums only: cameras, HomeBases and mowers are ignored', async (t) => {
  const { gladys } = await setup(t);
  const ids = gladys.fake.discoveredDevices.map((d) => d.external_id);
  assert.deepEqual(ids, [robot(X10.sn), robot(L60.sn)]);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /3 other eufy devices ignored/);
  assert.match(ack.data.message.en, /Robot salon \(T2351\): charging, 87 %/);
  assert.match(ack.data.message.en, /T2267 \(T2267\): stopped, 64 %, read only/);
  assert.match(ack.data.message.en, /Real time \(MQTT\): connected/);
  assert.match(ack.data.message.fr, /Robot salon \(T2351\) : en charge, 87 %/);
});

test('an X10 Pro Omni: the features of a Gladys robot vacuum', async (t) => {
  const { gladys } = await setup(t);
  const device = deviceOf(gladys, X10.sn);
  assert.equal(device.name, 'Robot salon');
  assert.deepEqual(device.params, [
    { name: 'model', value: 'T2351' },
    { name: 'serial_number', value: X10.sn },
  ]);
  assert.deepEqual(roles(gladys, X10.sn), [
    'state',
    'run-mode',
    'clean-mode',
    'dock',
    'suction',
    'battery',
    'charging',
    'error',
    'error-code',
    'side-brush',
    'rolling-brush',
    'filter',
    'mop',
    'sensors',
    'scraper',
    'clean-area',
    'clean-duration',
    'locate',
  ]);
  assert.deepEqual(
    featureOf(gladys, X10.sn, 'suction').supported_options.map((o) => [o.value, o.label]),
    [
      ['quiet', 'Quiet'],
      ['standard', 'Standard'],
      ['turbo', 'Turbo'],
      ['max', 'Max'],
      ['max_pro', 'Max Pro'],
    ],
  );
  assert.deepEqual(
    featureOf(gladys, X10.sn, 'run-mode').supported_options.map((o) => o.value),
    [RUN.IDLE, RUN.CLEANING],
  );
  assert.deepEqual(
    featureOf(gladys, X10.sn, 'clean-mode').supported_options.map((o) => o.value),
    [MODE.AUTO, MODE.VACUUM, MODE.MOP],
  );
});

test('an L60 (older line): readings only, no command', async (t) => {
  const { gladys } = await setup(t);
  assert.equal(deviceOf(gladys, L60.sn).name, 'eufy robot vacuum T2267');
  assert.deepEqual(roles(gladys, L60.sn), ['state', 'battery', 'error', 'error-code']);
  await create(gladys, L60.sn);
  await settle();
  const ack = await set(gladys, L60.sn, 'state', 1);
  assert.equal(ack.success, false);
});

test('created robots get their states; nothing is sent for the others', async (t) => {
  const { gladys, advance } = await setup(t);
  await advance(3_000);
  assert.equal(gladys.fake.states.length, 0);
  await create(gladys, X10.sn);
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.CHARGING);
  assert.equal(last(gladys, X10.sn, 'run-mode'), RUN.IDLE);
  assert.equal(last(gladys, X10.sn, 'clean-mode'), MODE.AUTO);
  assert.equal(last(gladys, X10.sn, 'suction'), 'standard');
  assert.equal(last(gladys, X10.sn, 'battery'), 87);
  assert.equal(last(gladys, X10.sn, 'charging'), 1);
  assert.equal(last(gladys, X10.sn, 'error'), 'No error');
  assert.equal(last(gladys, X10.sn, 'error-code'), 0);
  assert.equal(last(gladys, X10.sn, 'side-brush'), 75);
  assert.equal(last(gladys, X10.sn, 'rolling-brush'), 75);
  assert.equal(last(gladys, X10.sn, 'filter'), 0, 'worn out: never below 0');
  assert.equal(last(gladys, X10.sn, 'mop'), 90);
  assert.equal(last(gladys, X10.sn, 'sensors'), 90);
  assert.equal(last(gladys, X10.sn, 'scraper'), 90);
  assert.equal(last(gladys, X10.sn, 'clean-area'), 42);
  assert.equal(last(gladys, X10.sn, 'clean-duration'), 31);
  const ids = new Set(gladys.fake.states.map((s) => s.device_feature_external_id));
  assert.ok([...ids].every((id) => id.startsWith(robot(X10.sn))));
});

test('a cleaning in real time: states, then "cleaning finished" once', async (t) => {
  const { gladys, world, advance } = await setup(t);
  await create(gladys, X10.sn);
  await advance(3_000);

  world.report(X10.sn, {
    activity: 'cleaning',
    chargeState: undefined,
    clearTime: 0,
    clearArea: 0,
  });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.RUNNING);
  assert.equal(last(gladys, X10.sn, 'run-mode'), RUN.CLEANING);
  assert.equal(last(gladys, X10.sn, 'charging'), 0);

  world.report(X10.sn, { activity: 'paused' });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.PAUSED);
  assert.equal(last(gladys, X10.sn, 'run-mode'), RUN.CLEANING);

  world.report(X10.sn, { activity: 'cleaning', clearTime: 1500, clearArea: 36.25 });
  await advance(3_000);
  world.report(X10.sn, { activity: 'returning' });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.RETURNING_TO_DOCK);
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.CLEANING_FINISHED).length, 0);

  world.report(X10.sn, { activity: 'docked', chargeState: 'charging', battery: 41 });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.CHARGING);
  assert.deepEqual(eventsOf(gladys, SCENE_TRIGGERS.CLEANING_FINISHED), [
    {
      key: SCENE_TRIGGERS.CLEANING_FINISHED,
      data: { robot: robot(X10.sn), robot_name: 'Robot salon', duration: 25, area: 36.3 },
    },
  ]);

  world.report(X10.sn, { chargeState: 'charged', battery: 100 });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.DOCKED);
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.CLEANING_FINISHED).length, 1);
});

test('an error: the text, the code and one "robot error" event per new code', async (t) => {
  const { gladys, world, advance } = await setup(t);
  await create(gladys, X10.sn);
  await advance(3_000);
  world.report(X10.sn, { activity: 'cleaning', chargeState: undefined });
  await advance(3_000);
  world.report(X10.sn, { activity: 'error', errorCode: 2 });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'state'), STATE.ERROR);
  assert.equal(last(gladys, X10.sn, 'error'), 'Wheel stuck (2)');
  assert.equal(last(gladys, X10.sn, 'error-code'), 2);
  world.report(X10.sn, { battery: 50 });
  await advance(3_000);
  assert.deepEqual(eventsOf(gladys, SCENE_TRIGGERS.ROBOT_ERROR), [
    {
      key: SCENE_TRIGGERS.ROBOT_ERROR,
      data: {
        robot: robot(X10.sn),
        robot_name: 'Robot salon',
        error_code: 2,
        error_message: 'Wheel stuck (2)',
      },
    },
  ]);
  // Back on the dock by hand after an error: not a finished cleaning.
  world.report(X10.sn, { activity: 'docked', errorCode: 0, chargeState: 'charging' });
  await advance(3_000);
  assert.equal(last(gladys, X10.sn, 'error'), 'No error');
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.CLEANING_FINISHED).length, 0);
});

test('the commands go to the SDK writes, the robot answers over MQTT', async (t) => {
  const { gladys, world, advance } = await setup(t);
  await create(gladys, X10.sn);
  const calls = world.devices.get(X10.sn).calls;

  assert.equal((await set(gladys, X10.sn, 'run-mode', RUN.CLEANING)).success, true);
  assert.deepEqual(calls.at(-1), ['startCleaning']);
  world.report(X10.sn, { activity: 'cleaning' });
  await advance(3_000);

  assert.equal((await set(gladys, X10.sn, 'run-mode', RUN.IDLE)).success, true);
  assert.deepEqual(calls.at(-1), ['pauseCleaning']);
  world.report(X10.sn, { activity: 'paused' });
  await advance(3_000);

  assert.equal((await set(gladys, X10.sn, 'run-mode', RUN.CLEANING)).success, true);
  assert.deepEqual(calls.at(-1), ['resumeCleaning'], 'a paused job resumes');

  assert.equal((await set(gladys, X10.sn, 'dock', 1)).success, true);
  assert.deepEqual(calls.at(-1), ['returnToDock']);

  assert.equal((await set(gladys, X10.sn, 'clean-mode', MODE.MOP)).success, true);
  assert.deepEqual(calls.at(-1), ['setCleanParam', 'mop', 'normal', 'middle']);
  assert.equal((await set(gladys, X10.sn, 'clean-mode', MODE.VACUUM)).success, true);
  assert.deepEqual(calls.at(-1), ['setCleanParam', 'sweep', 'normal', 'middle']);

  assert.equal((await set(gladys, X10.sn, 'suction', 'max_pro')).success, true);
  assert.deepEqual(calls.at(-1), ['setSuctionLevel', 5]);

  assert.equal((await set(gladys, X10.sn, 'locate', 1)).success, true);
  assert.deepEqual(calls.at(-1), ['locate', true]);

  const count = calls.length;
  const refused = [
    await set(gladys, X10.sn, 'suction', 'boost_iq'),
    await set(gladys, X10.sn, 'clean-mode', MODE.QUICK),
    await set(gladys, X10.sn, 'run-mode', RUN.MAPPING),
  ];
  assert.ok(refused.every((ack) => ack.success === false && /unsupported value/.test(ack.error)));
  assert.equal(calls.length, count, 'nothing sent for a value the robot does not offer');
});

test('"pause" on a robot already docked sends nothing', async (t) => {
  const { gladys, world } = await setup(t);
  await create(gladys, X10.sn);
  const ack = await set(gladys, X10.sn, 'run-mode', RUN.IDLE);
  assert.equal(ack.success, true);
  assert.deepEqual(world.devices.get(X10.sn).calls, []);
});

test('a robot reporting more later gains its features, kept across restarts', async (t) => {
  const factory = fakeEufy({
    needsCode: false,
    x10: { activity: 'docked', chargeState: 'charging', battery: 90 },
  });
  const store = memoryStore();
  const { gladys, world, advance } = await setup(t, { factory, store });
  assert.ok(!roles(gladys, X10.sn).includes('side-brush'));
  world.report(X10.sn, { sideBrushHours: 18, cleanType: 'sweep', mopLevel: 'low' });
  await advance(3_000);
  assert.ok(roles(gladys, X10.sn).includes('side-brush'));
  assert.ok(roles(gladys, X10.sn).includes('clean-mode'));
  assert.ok(store.data.roles[X10.sn].includes('side-brush'));

  // A restart before the robot's first report: the features stay.
  const again = fakeEufy({ needsCode: false, sessionStored: true, x10: { battery: 90 } });
  const second = createFakeGladys({ config: CONFIG });
  const app = new EufyCleanApp({ gladys: second, createClient: again, store, dataDir: '/tmp/x' });
  registerHandlers(second, app);
  await second.connect();
  await settle();
  t.after(() => app.stop());
  const restarted = second.fake.discoveredDevices.find((d) => d.external_id === robot(X10.sn));
  assert.ok(restarted.features.some((f) => f.external_id.endsWith(':side-brush')));
});

test('a robot going offline: unreachable badge, back online: cloud', async (t) => {
  const { gladys, world } = await setup(t);
  await create(gladys, X10.sn);
  const client = world.client();
  const observation = (availability) => ({
    entity: { kind: 'device', sn: X10.sn },
    availability,
    scope: 'device',
    receivedAt: NOW,
  });
  client.emit('availability', observation('unavailable'));
  await settle();
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: robot(X10.sn),
    transport: 'unreachable',
  });
  client.emit('availability', observation('available'));
  await settle();
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
});

test('a session ended by eufy: a new sign-in after the delay the SDK asks', async (t) => {
  const factory = fakeEufy({ needsCode: false });
  const { gladys, world, advance } = await setup(t, { factory });
  world.client().emit('sessionExpired', new ExpiredError('kicked', 5 * 60_000));
  await settle();
  assert.equal(status(gladys).connected, false);
  assert.match(status(gladys).message.en, /session ended.*5 min/);
  const ack = await set(gladys, X10.sn, 'dock', 1);
  assert.match(ack.error, /not connected/);
  await advance(5 * 60_000);
  assert.equal(world.logins, 2);
  assert.equal(status(gladys).connected, true);
});

test('the real-time channel does not open: said in the status, tried again', async (t) => {
  const factory = fakeEufy({ needsCode: false });
  factory.world.realtime = {
    state: 'partial',
    mqtt: { required: 1, ready: 0, failed: 1, pending: 0 },
  };
  const { gladys, world, advance } = await setup(t, { factory });
  assert.match(status(gladys).message.en, /real-time channel \(MQTT\) did not open/);
  world.realtime = { state: 'ready', mqtt: { required: 1, ready: 1, failed: 0, pending: 0 } };
  await advance(TIMINGS.retryMin);
  assert.equal(world.client().disconnects, 1);
  assert.match(status(gladys).message.en, /Connected to eufy/);
});

test('a robot added to the account appears in Discovery', async (t) => {
  const factory = fakeEufy({ needsCode: false, list: [] });
  const { gladys, world } = await setup(t, { factory });
  assert.equal(gladys.fake.discoveredDevices.length, 0);
  world.list = [X10];
  world.client().emit('deviceAdded', X10);
  await settle();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [robot(X10.sn)],
  );
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.doesNotMatch(ack.data.message.en, /ignored/);
});

test('names follow the language of the configuration', async (t) => {
  const { gladys } = await setup(t, { config: { ...CONFIG, language: 'fr' } });
  assert.equal(featureOf(gladys, X10.sn, 'battery').name, 'Batterie');
  assert.equal(deviceOf(gladys, L60.sn).name, 'Aspirateur robot eufy T2267');
  await gladys.fake.configUpdated({ ...CONFIG, language: 'en' });
  await settle();
  assert.equal(featureOf(gladys, X10.sn, 'battery').name, 'Battery');
});

test('stop disconnects from eufy', async (t) => {
  const { app, world } = await setup(t);
  await app.stop();
  assert.equal(world.client().disconnects, 1);
});
