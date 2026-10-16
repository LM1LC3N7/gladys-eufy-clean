// -----------------------------------------------------------------------------
// Robot readings -> Gladys devices and states (pure).
//
// One device per robot vacuum, `ext:<selector>:robot:<serial>`, shaped like
// the core exposes robot vacuums (Matter RVC): `vacuum-cleaner` state,
// run-mode, clean-mode and dock, plus the battery, the `maintenance`
// consumables, the error and the last job. A feature exists when the robot
// reports its value or the SDK offers its command (`rolesOf`).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { CONSUMABLES, GLADYS, SUCTION_LEVELS } from './constants.js';
import { faultText } from './faults.js';
import {
  CLEAN_MODE_NAMES,
  ROBOT_NAME,
  RUN_MODE_NAMES,
  SUCTION_NAMES,
  featureName,
  word,
} from './i18n.js';

const { VACUUM_STATE: STATE, VACUUM_RUN_MODE: RUN, VACUUM_CLEAN_MODE: MODE } = GLADYS;

const maintenance = {
  category: C.MAINTENANCE,
  type: T.MAINTENANCE.LIFE_REMAINING,
  unit: U.PERCENT,
  min: 0,
  max: 100,
};
const command = { read_only: false, has_feedback: true, keep_history: false };

/** The features, by role (the last part of their external id). */
export const FEATURES = {
  state: { category: C.VACUUM_CLEANER, type: T.VACUUM_CLEANER.STATE, min: 0, max: 6 },
  'run-mode': {
    category: C.VACUUM_CLEANER,
    type: T.VACUUM_CLEANER.RUN_MODE,
    min: 0,
    max: 2,
    ...command,
  },
  'clean-mode': {
    category: C.VACUUM_CLEANER,
    type: T.VACUUM_CLEANER.CLEAN_MODE,
    min: 0,
    max: 6,
    ...command,
  },
  dock: {
    category: C.VACUUM_CLEANER,
    type: T.VACUUM_CLEANER.DOCK,
    min: 0,
    max: 1,
    ...command,
    has_feedback: false,
  },
  suction: { category: C.TEXT, type: T.TEXT.SELECT, min: 0, max: 0, ...command },
  battery: { category: C.BATTERY, type: T.BATTERY.INTEGER, unit: U.PERCENT, min: 0, max: 100 },
  charging: { category: C.BATTERY, type: T.BATTERY.CHARGING, min: 0, max: 1 },
  error: { category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, keep_history: false },
  'error-code': { category: C.UNKNOWN, type: T.UNKNOWN.UNKNOWN, min: 0, max: 100000 },
  ...Object.fromEntries(CONSUMABLES.map(({ role }) => [role, maintenance])),
  'clean-area': {
    category: C.SURFACE,
    type: T.SURFACE.DECIMAL,
    unit: U.SQUARE_METER,
    min: 0,
    max: 10000,
  },
  'clean-duration': {
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 1440,
  },
  locate: {
    category: C.BUTTON,
    type: T.BUTTON.PUSH,
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: false,
    keep_history: false,
  },
};

/** The display order of the features. */
export const ROLES = Object.keys(FEATURES);

/** What onSetValue accepts. */
export const COMMAND_ROLES = ['run-mode', 'clean-mode', 'dock', 'suction', 'locate'];

export const robotIds = (gladys, sn) => gladys.externalIds('robot', String(sn));

/** The serial and role of a feature external id. */
export function parseFeatureId(externalId) {
  const match = /:robot:([^:]+):([^:]+)$/.exec(String(externalId ?? ''));
  return match ? { sn: match[1], role: match[2] } : undefined;
}

/** The serial of a device external id. */
export function parseDeviceId(externalId) {
  const match = /:robot:([^:]+)$/.exec(String(externalId ?? ''));
  return match ? match[1] : undefined;
}

/**
 * A robot that reports a clean type has a mop, unless it only ever says
 * "sweep" (the SDK reads "no type" as sweep) and no mop level.
 */
const hasMop = (reading) =>
  reading.cleanType !== undefined &&
  (reading.cleanType !== 'sweep' || reading.mopLevel !== undefined);

/** The roles a reading supports, in display order. */
export function rolesOf(reading) {
  const roles = new Set(['state', 'battery', 'error', 'error-code']);
  if (reading.charging !== undefined) {
    roles.add('charging');
  }
  if (reading.commands.start) {
    roles.add('run-mode');
  }
  if (reading.commands.dock) {
    roles.add('dock');
  }
  if (reading.commands.cleanParam && hasMop(reading)) {
    roles.add('clean-mode');
  }
  if (reading.suction.writable) {
    roles.add('suction');
  }
  for (const role of Object.keys(reading.consumables)) {
    roles.add(role);
  }
  if (reading.cleanArea !== undefined) {
    roles.add('clean-area');
  }
  if (reading.cleanTime !== undefined) {
    roles.add('clean-duration');
  }
  if (reading.commands.locate) {
    roles.add('locate');
  }
  return ROLES.filter((role) => roles.has(role));
}

/** Two role lists merged, in display order (a feature never disappears). */
export const mergeRoles = (...lists) => {
  const all = new Set(lists.flat());
  return ROLES.filter((role) => all.has(role));
};

const suctionOptions = (levels, language) =>
  SUCTION_LEVELS.filter((s) => levels.includes(s.level)).map((s, index) => ({
    value: s.value,
    label: word(SUCTION_NAMES[s.value], language),
    sort_order: index,
  }));

function feature(ids, role, language, reading) {
  const built = {
    name: featureName(role, language),
    external_id: ids.feature(role),
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...FEATURES[role],
  };
  if (role === 'run-mode') {
    built.supported_options = [RUN.IDLE, RUN.CLEANING].map((value, index) => ({
      value,
      label: word(RUN_MODE_NAMES[value], language),
      sort_order: index,
    }));
  }
  if (role === 'clean-mode') {
    built.supported_options = [MODE.AUTO, MODE.VACUUM, MODE.MOP].map((value, index) => ({
      value,
      label: word(CLEAN_MODE_NAMES[value], language),
      sort_order: index,
    }));
  }
  if (role === 'suction') {
    built.supported_options = suctionOptions(reading?.suction.levels ?? [0, 1, 2, 3], language);
  }
  return built;
}

function params(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([name, value]) => ({ name, value: String(value) }));
}

/** The Gladys device of one robot. */
export function buildDevice(gladys, robot, roles, reading, language) {
  const ids = robotIds(gladys, robot.sn);
  return {
    name: robot.name || `${word(ROBOT_NAME, language)} ${robot.model}`.trim(),
    external_id: ids.device,
    should_poll: false,
    features: roles.map((role) => feature(ids, role, language, reading)),
    params: params([
      ['model', robot.model],
      ['serial_number', robot.sn],
    ]),
  };
}

/** The Gladys state of the robot (VACUUM_CLEANER_STATE). */
export function vacuumState(reading) {
  switch (reading.activity) {
    case 'cleaning':
      return STATE.RUNNING;
    case 'paused':
      return STATE.PAUSED;
    case 'error':
      return STATE.ERROR;
    case 'returning':
      return STATE.RETURNING_TO_DOCK;
    case 'docked':
      return reading.charging ? STATE.CHARGING : STATE.DOCKED;
    case 'idle':
      return STATE.STOPPED;
    default:
      return undefined;
  }
}

/** The clean type -> clean-mode (Auto = vacuum and mop). */
export function cleanMode(cleanType) {
  switch (cleanType) {
    case 'sweep':
      return MODE.VACUUM;
    case 'mop':
      return MODE.MOP;
    case 'sweepAndMop':
    case 'sweepThenMop':
      return MODE.AUTO;
    default:
      return undefined;
  }
}

/** Life remaining of a part, in percent, from its hours of use. */
export function lifeRemaining(hours, lifeHours) {
  return Math.max(0, Math.min(100, Math.round(100 - (hours / lifeHours) * 100)));
}

/** The current states of a robot, for the roles its device has. */
export function robotStates(ids, reading, roles, language) {
  const has = new Set(roles);
  const states = [];
  const put = (role, value) => {
    if (has.has(role) && value !== undefined) {
      states.push({
        device_feature_external_id: ids.feature(role),
        ...(typeof value === 'object' ? value : { state: value }),
      });
    }
  };
  const state = vacuumState(reading);
  put('state', state);
  if (reading.activity !== undefined) {
    const busy = reading.activity === 'cleaning' || reading.activity === 'paused';
    put('run-mode', busy ? RUN.CLEANING : RUN.IDLE);
  }
  put('clean-mode', cleanMode(reading.cleanType));
  const suction = SUCTION_LEVELS.find((s) => s.level === reading.suction.level);
  put('suction', suction ? { text: suction.value } : undefined);
  put('battery', reading.battery);
  put('charging', reading.charging === undefined ? undefined : reading.charging ? 1 : 0);
  if (reading.errorCode !== undefined) {
    put('error', { text: faultText(reading.errorCode, language) });
    put('error-code', reading.errorCode);
  }
  for (const { role, lifeHours } of CONSUMABLES) {
    const hours = reading.consumables[role];
    put(role, hours === undefined ? undefined : lifeRemaining(hours, lifeHours));
  }
  put(
    'clean-area',
    reading.cleanArea === undefined ? undefined : Math.round(reading.cleanArea * 10) / 10,
  );
  put(
    'clean-duration',
    reading.cleanTime === undefined ? undefined : Math.round(reading.cleanTime / 60),
  );
  return states;
}
