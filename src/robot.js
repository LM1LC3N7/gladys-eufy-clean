// -----------------------------------------------------------------------------
// The eufy SDK's objects -> plain readings (pure).
//
// The SDK models a robot as a `Device` whose capabilities are accessors:
// `dev.vacuumClean()`, `dev.suction()`, `dev.locate()`. Each getter exists
// only once the robot has reported its value over MQTT, each write only where
// the SDK has confirmed it, so everything here is optional. The accessors are
// called again at every reading: the SDK replaces the bound objects when new
// evidence arrives.
// -----------------------------------------------------------------------------

import { ACTIVITIES, CONSUMABLES, DEFAULT_SUCTION_LEVELS, SUCTION_LEVELS } from './constants.js';

/** The account's robot vacuums, and how many other devices are left to eufy Security. */
export function robotsOf(list = []) {
  const robots = [];
  let ignored = 0;
  for (const device of list) {
    if (device?.deviceClass === 'vacuum' && typeof device.sn === 'string' && device.sn !== '') {
      robots.push({
        sn: device.sn,
        name: typeof device.name === 'string' && device.name.trim() ? device.name.trim() : '',
        model: typeof device.model === 'string' ? device.model : '',
        // eufy_home_tuya: the older robots (G, L, X8…), read only in the SDK.
        legacy: device.category === 'eufy_home_tuya',
      });
    } else {
      ignored += 1;
    }
  }
  return { robots, ignored };
}

/** A capability accessor's bound object, or undefined. */
function accessor(device, name) {
  try {
    const get = device?.[name];
    return typeof get === 'function' ? (get.call(device) ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

/** A getter's value, or undefined (absent, null, or throwing). */
function read(object, key) {
  try {
    const value = object?.[key];
    return value === null ? undefined : value;
  } catch {
    return undefined;
  }
}

const number = (value) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const can = (object, method) => typeof read(object, method) === 'function';

/** The older robots spell the clean type in Tuya words. */
const CLEAN_TYPES = {
  sweep: 'sweep',
  mop: 'mop',
  sweepAndMop: 'sweepAndMop',
  sweepThenMop: 'sweepThenMop',
  Sweep: 'sweep',
  Mop: 'mop',
  SweepMop: 'sweepAndMop',
};

/**
 * One robot, as plain data:
 *   activity     'idle' | 'error' | 'docked' | 'cleaning' | 'returning' | 'paused' | undefined
 *   charging     true while on its contacts and charging, false otherwise, undefined unknown
 *   battery      0..100
 *   errorCode    0 = none
 *   cleanType    'sweep' | 'mop' | 'sweepAndMop' | 'sweepThenMop'
 *   suction      { level, levels, writable } (levels: the SDK's numbers)
 *   consumables  { role: hours used }
 *   cleanArea    m², cleanTime s (the current or last job)
 *   commands     which writes the SDK offers for this robot
 */
export function readRobot(device) {
  const clean = accessor(device, 'vacuumClean');
  const suction = accessor(device, 'suction');
  const locate = accessor(device, 'locate');

  // AIoT robots report WorkStatus (DP 153); the older ones a work status string (DP 15).
  const workStatus = read(clean, 'activity');
  const aiot = ACTIVITIES.includes(workStatus);
  let activity = aiot ? workStatus : read(clean, 'workStatus');
  if (!ACTIVITIES.includes(activity)) {
    activity = undefined;
  }

  // In a WorkStatus, the charge message exists only while the robot charges
  // on its contacts: its absence means "not charging". The older robots say
  // nothing about it.
  const chargeState = read(clean, 'chargeState');
  const charging = chargeState === 'charging' ? true : aiot ? false : undefined;

  const battery = number(read(clean, 'battery'));
  const level = number(read(suction, 'level'));
  const supported = read(suction, 'supportedLevels');
  const known = new Set(SUCTION_LEVELS.map((s) => s.level));
  const levels = (
    Array.isArray(supported) && supported.length > 0 ? supported : DEFAULT_SUCTION_LEVELS
  ).filter((l) => known.has(l));

  const consumables = {};
  for (const { role, member } of CONSUMABLES) {
    const hours = number(read(clean, member));
    if (hours !== undefined && hours >= 0) {
      consumables[role] = hours;
    }
  }

  const cleanTime = number(read(clean, 'clearTime'));
  const cleanArea = number(read(clean, 'clearArea'));

  return {
    activity,
    charging,
    battery: battery !== undefined ? Math.max(0, Math.min(100, Math.round(battery))) : undefined,
    errorCode: number(read(clean, 'errorCode')),
    cleanType: CLEAN_TYPES[read(clean, 'cleanType')],
    cleanExtent: read(clean, 'cleanExtent'),
    mopLevel: read(clean, 'mopLevel'),
    suction: {
      level: level !== undefined && known.has(level) ? level : undefined,
      levels,
      writable: can(suction, 'setSuctionLevel'),
    },
    consumables,
    cleanTime: cleanTime !== undefined && cleanTime >= 0 ? cleanTime : undefined,
    cleanArea: cleanArea !== undefined && cleanArea >= 0 ? cleanArea : undefined,
    commands: {
      start: can(clean, 'startCleaning'),
      pause: can(clean, 'pauseCleaning'),
      resume: can(clean, 'resumeCleaning'),
      dock: can(clean, 'returnToDock'),
      cleanParam: can(clean, 'setCleanParam'),
      locate: can(locate, 'locate'),
    },
  };
}

/** Runs one write of the SDK on a robot: `clean.startCleaning()`, `suction.setSuctionLevel(2)`… */
export async function runCommand(device, capability, method, ...args) {
  const target = accessor(device, capability);
  if (!can(target, method)) {
    return false;
  }
  await target[method](...args);
  return true;
}
