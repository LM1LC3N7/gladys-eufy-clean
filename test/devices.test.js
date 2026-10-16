import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { GLADYS } from '../src/constants.js';
import {
  COMMAND_ROLES,
  FEATURES,
  ROLES,
  buildDevice,
  cleanMode,
  lifeRemaining,
  mergeRoles,
  parseDeviceId,
  parseFeatureId,
  robotIds,
  robotStates,
  rolesOf,
  vacuumState,
} from '../src/devices.js';
import { readRobot } from '../src/robot.js';
import { AIOT_COMMANDS, X10, X10_DOCKED, fakeDevice } from './fixtures/robots.js';

const gladys = createFakeGladys();
const S = GLADYS.VACUUM_STATE;

// Units Gladys accepts per category (DEVICE_FEATURE_UNITS_BY_CATEGORY, core master
// 2026-10-16): a unit outside them is refused by the device form.
const UNITS = {
  [C.BATTERY]: [U.PERCENT],
  [C.MAINTENANCE]: [U.PERCENT],
  [C.SURFACE]: [U.SQUARE_CENTIMETER, U.SQUARE_METER, U.SQUARE_KILOMETER],
  [C.DURATION]: [U.SECONDS, U.MINUTES, U.HOURS, U.DAYS],
};

test('every feature uses a category and type of the SDK, and an accepted unit', () => {
  const categories = new Set(Object.values(C));
  for (const [role, feature] of Object.entries(FEATURES)) {
    assert.ok(categories.has(feature.category), `${role}: ${feature.category}`);
    const types = Object.values(T).flatMap((group) => Object.values(group));
    assert.ok(types.includes(feature.type), `${role}: ${feature.type}`);
    if (feature.unit !== undefined) {
      assert.ok(UNITS[feature.category]?.includes(feature.unit), `${role}: ${feature.unit}`);
    }
    assert.ok(feature.min <= feature.max, role);
  }
  assert.equal(FEATURES.state.category, 'vacuum-cleaner');
  assert.equal(FEATURES['side-brush'].category, 'maintenance');
  assert.equal(FEATURES['side-brush'].type, 'life-remaining');
  for (const role of COMMAND_ROLES) {
    assert.equal(FEATURES[role].read_only, false, role);
  }
});

test('the vacuum states are the core values', () => {
  assert.deepEqual(S, {
    STOPPED: 0,
    RUNNING: 1,
    PAUSED: 2,
    ERROR: 3,
    RETURNING_TO_DOCK: 4,
    CHARGING: 5,
    DOCKED: 6,
  });
  const cases = [
    ['cleaning', false, S.RUNNING],
    ['paused', false, S.PAUSED],
    ['error', false, S.ERROR],
    ['returning', false, S.RETURNING_TO_DOCK],
    ['docked', true, S.CHARGING],
    ['docked', false, S.DOCKED],
    ['docked', undefined, S.DOCKED],
    ['idle', false, S.STOPPED],
    [undefined, false, undefined],
  ];
  for (const [activity, charging, expected] of cases) {
    assert.equal(vacuumState({ activity, charging }), expected, `${activity}/${charging}`);
  }
});

test('clean types and consumables', () => {
  assert.equal(cleanMode('sweep'), GLADYS.VACUUM_CLEAN_MODE.VACUUM);
  assert.equal(cleanMode('mop'), GLADYS.VACUUM_CLEAN_MODE.MOP);
  assert.equal(cleanMode('sweepAndMop'), GLADYS.VACUUM_CLEAN_MODE.AUTO);
  assert.equal(cleanMode('sweepThenMop'), GLADYS.VACUUM_CLEAN_MODE.AUTO);
  assert.equal(cleanMode(undefined), undefined);
  assert.equal(lifeRemaining(0, 180), 100);
  assert.equal(lifeRemaining(90, 180), 50);
  assert.equal(lifeRemaining(500, 180), 0);
});

test('external ids', () => {
  const ids = robotIds(gladys, X10.sn);
  assert.equal(ids.device, `ext:test-integration:robot:${X10.sn}`);
  assert.deepEqual(parseFeatureId(ids.feature('dock')), { sn: X10.sn, role: 'dock' });
  assert.equal(parseDeviceId(ids.device), X10.sn);
  assert.equal(parseFeatureId('ext:other:thing'), undefined);
  assert.equal(parseDeviceId(undefined), undefined);
});

test('roles: only a mop robot gets the cleaning type, merged in display order', () => {
  const base = readRobot(fakeDevice(X10, {}, { commands: AIOT_COMMANDS }));
  assert.deepEqual(rolesOf(base), [
    'state',
    'run-mode',
    'dock',
    'suction',
    'battery',
    'error',
    'error-code',
    'locate',
  ]);
  const sweeper = readRobot(fakeDevice(X10, { cleanType: 'sweep' }, { commands: AIOT_COMMANDS }));
  assert.ok(!rolesOf(sweeper).includes('clean-mode'), '"sweep" alone may mean no type');
  const mopper = readRobot(
    fakeDevice(X10, { cleanType: 'sweep', mopLevel: 'low' }, { commands: AIOT_COMMANDS }),
  );
  assert.ok(rolesOf(mopper).includes('clean-mode'));
  assert.deepEqual(mergeRoles(['locate', 'state'], ['battery', 'state']), [
    'state',
    'battery',
    'locate',
  ]);
  assert.deepEqual(ROLES.slice(0, 4), ['state', 'run-mode', 'clean-mode', 'dock']);
});

test('buildDevice: name, features, options', () => {
  const reading = readRobot(fakeDevice(X10, { ...X10_DOCKED }, { commands: AIOT_COMMANDS }));
  const info = { sn: X10.sn, name: '', model: 'T2351' };
  const device = buildDevice(gladys, info, rolesOf(reading), reading, 'en');
  assert.equal(device.name, 'eufy robot vacuum T2351');
  assert.equal(device.should_poll, false);
  const dock = device.features.find((f) => f.external_id.endsWith(':dock'));
  assert.equal(dock.has_feedback, false);
  const state = device.features.find((f) => f.external_id.endsWith(':state'));
  assert.equal(state.read_only, true);
  assert.equal(state.keep_history, true);
  const suction = device.features.find((f) => f.external_id.endsWith(':suction'));
  assert.deepEqual(
    suction.supported_options.map((o) => o.sort_order),
    [0, 1, 2, 3, 4],
  );
  const fr = buildDevice(gladys, info, ['run-mode'], reading, 'fr');
  assert.deepEqual(
    fr.features[0].supported_options.map((o) => o.label),
    ['Pause', 'Nettoyer'],
  );
});

test('robotStates: only the roles of the device, text states for texts', () => {
  const reading = readRobot(fakeDevice(X10, { ...X10_DOCKED }, { commands: AIOT_COMMANDS }));
  const ids = robotIds(gladys, X10.sn);
  const states = robotStates(ids, reading, ['state', 'suction', 'error'], 'fr');
  assert.deepEqual(states, [
    { device_feature_external_id: ids.feature('state'), state: S.CHARGING },
    { device_feature_external_id: ids.feature('suction'), text: 'standard' },
    { device_feature_external_id: ids.feature('error'), text: 'Aucune erreur' },
  ]);
  const empty = readRobot(fakeDevice(X10, {}));
  assert.deepEqual(robotStates(ids, empty, ROLES, 'en'), [], 'nothing reported, nothing sent');
});
