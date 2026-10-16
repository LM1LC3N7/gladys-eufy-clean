import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRobot, robotsOf, runCommand } from '../src/robot.js';
import {
  ACCOUNT,
  AIOT_COMMANDS,
  L60,
  L60_IDLE,
  X10,
  X10_DOCKED,
  fakeDevice,
} from './fixtures/robots.js';

test('robotsOf keeps the robot vacuums and counts the rest', () => {
  const { robots, ignored } = robotsOf(ACCOUNT);
  assert.deepEqual(robots, [
    { sn: X10.sn, name: 'Robot salon', model: 'T2351', legacy: false },
    { sn: L60.sn, name: '', model: 'T2267', legacy: true },
  ]);
  assert.equal(ignored, 3, 'camera, HomeBase, mower');
  assert.deepEqual(robotsOf(undefined), { robots: [], ignored: 0 });
  assert.equal(robotsOf([{ deviceClass: 'vacuum' }]).robots.length, 0, 'no serial, no robot');
});

test('readRobot: an AIoT robot (X10 Pro Omni)', () => {
  const reading = readRobot(fakeDevice(X10, { ...X10_DOCKED }, { commands: AIOT_COMMANDS }));
  assert.deepEqual(reading, {
    activity: 'docked',
    charging: true,
    battery: 87,
    errorCode: 0,
    cleanType: 'sweepAndMop',
    cleanExtent: 'normal',
    mopLevel: 'middle',
    suction: { level: 1, levels: [0, 1, 2, 3, 5], writable: true },
    consumables: {
      'side-brush': 45,
      'rolling-brush': 90,
      filter: 400,
      mop: 18,
      sensors: 6,
      scraper: 3,
    },
    cleanTime: 1830,
    cleanArea: 42,
    commands: {
      start: true,
      pause: true,
      resume: true,
      dock: true,
      cleanParam: true,
      locate: true,
    },
  });
});

test('readRobot: no charge message on an AIoT robot = not charging', () => {
  const state = { ...X10_DOCKED, chargeState: undefined, activity: 'cleaning' };
  assert.equal(readRobot(fakeDevice(X10, state)).charging, false);
  assert.equal(readRobot(fakeDevice(X10, { ...state, chargeState: 'charged' })).charging, false);
});

test('readRobot: an older robot (L60) reads its work status, has no command', () => {
  const reading = readRobot(fakeDevice(L60, { ...L60_IDLE }));
  assert.equal(reading.activity, 'idle');
  assert.equal(reading.charging, undefined, 'the older line says nothing about charging');
  assert.equal(reading.battery, 64);
  assert.equal(reading.suction.writable, false);
  assert.deepEqual(Object.values(reading.commands), [false, false, false, false, false, false]);
  const tuya = readRobot(fakeDevice(L60, { workStatus: 'docked', cleanType: 'SweepMop' }));
  assert.equal(tuya.cleanType, 'sweepAndMop', 'Tuya words');
});

test('readRobot: a robot that has reported nothing yet', () => {
  const reading = readRobot(fakeDevice(X10, {}));
  assert.equal(reading.activity, undefined);
  assert.equal(reading.battery, undefined);
  assert.equal(reading.charging, undefined);
  assert.deepEqual(reading.consumables, {});
  assert.deepEqual(reading.suction, { level: undefined, levels: [0, 1, 2, 3], writable: false });
});

test('readRobot survives odd values and throwing getters', () => {
  const device = {
    vacuumClean: () => ({
      get activity() {
        throw new Error('not bound');
      },
      workStatus: 'unknown',
      battery: '101',
      errorCode: null,
      sideBrushHours: -3,
      clearArea: Number.NaN,
    }),
    suction: () => ({ level: 9, supportedLevels: [1, 9] }),
    locate() {
      throw new Error('boom');
    },
  };
  const reading = readRobot(device);
  assert.equal(reading.activity, undefined, '"unknown" is no reading');
  assert.equal(reading.battery, 100);
  assert.equal(reading.errorCode, undefined);
  assert.deepEqual(reading.consumables, {});
  assert.equal(reading.cleanArea, undefined);
  assert.deepEqual(reading.suction, { level: undefined, levels: [1], writable: false });
  assert.equal(reading.commands.locate, false);
  assert.deepEqual(readRobot(undefined).commands.start, false);
});

test('runCommand calls the bound write, or says it does not exist', async () => {
  const device = fakeDevice(X10, { ...X10_DOCKED }, { commands: ['startCleaning'] });
  assert.equal(await runCommand(device, 'vacuumClean', 'startCleaning'), true);
  assert.equal(await runCommand(device, 'vacuumClean', 'returnToDock'), false);
  assert.equal(await runCommand(device, 'locate', 'locate'), false);
  assert.deepEqual(device.calls, [['startCleaning']]);
});
