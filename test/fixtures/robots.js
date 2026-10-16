// -----------------------------------------------------------------------------
// Robots as @mega-yfue/eufy-sdk 0.5.0-beta.54 hands them out: a `Device`
// whose capability accessors (`vacuumClean()`, `suction()`, `locate()`)
// return bound objects with typed getters and write methods.
//
// Sources: the SDK's own declarations (dist/model/capabilities/vacuum-clean,
// suction, locate .d.ts: VACUUM_CLEAN_MEMBERS, SUCTION_MEMBERS), its
// "Vacuums & mowers" guide (getters present only once reported, writes only
// where confirmed, Tuya-line robots read only), the device records of
// `getDevices()` (core/types.d.ts EufyDevice: sn, name, model, category,
// deviceClass) and the values its comments state for a live T2351 (battery
// 0-100, activity names, suction 0-5, hours of use per part, clearTime in s,
// clearArea in m²). Serials and names are made up.
// -----------------------------------------------------------------------------

export const EMAIL = 'robot.owner@example.com';
export const PASSWORD = 'correct horse battery staple';
export const CODE = '123456';
export const CAPTCHA = 'AB12';
export const CAPTCHA_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

/** `getDevices()` of an account: two robots, a camera and its HomeBase, a mower. */
export const X10 = {
  sn: 'T2351P1234567890',
  name: 'Robot salon',
  model: 'T2351',
  category: 'eufy_home',
  deviceClass: 'vacuum',
  api: 'mega',
  realtime: 'mqtt',
};
export const L60 = {
  sn: 'T2267P0987654321',
  name: '',
  model: 'T2267',
  category: 'eufy_home_tuya',
  deviceClass: 'vacuum',
  api: 'mega',
  realtime: 'mqtt',
};
export const CAMERA = {
  sn: 'T8410P0000000001',
  name: 'Entrée',
  model: 'T8410',
  category: 'eufy_security',
  deviceClass: 'camera',
  api: 'mega',
  realtime: 'p2p',
};
export const HOMEBASE = {
  sn: 'T8030P0000000002',
  name: 'HomeBase',
  model: 'T8030',
  category: 'eufy_security',
  deviceClass: 'homebase',
  api: 'mega',
  realtime: 'p2p',
};
export const MOWER = {
  sn: 'T2880P0000000003',
  name: 'Tondeuse',
  model: 'T2880',
  category: 'eufy_home_tuya',
  deviceClass: 'mower',
  api: 'mega',
  realtime: 'mqtt',
};
export const ACCOUNT = [X10, L60, CAMERA, HOMEBASE, MOWER];

/** An X10 Pro Omni docked and charging, as its first MQTT reports leave it. */
export const X10_DOCKED = {
  activity: 'docked',
  chargeState: 'charging',
  triggerSource: 'unknown',
  battery: 87,
  errorCode: 0,
  cleanType: 'sweepAndMop',
  cleanExtent: 'normal',
  mopLevel: 'middle',
  sideBrushHours: 45,
  rollingBrushHours: 90,
  filterHours: 400,
  mopHours: 18,
  sensorHours: 6,
  scraperHours: 3,
  dustBagHours: 12,
  clearTime: 1830,
  clearArea: 42,
  suctionLevel: 1,
  supportedLevels: [0, 1, 2, 3, 5],
};

/** An L60 (eufy_home_tuya): the SDK binds its reads, no write. */
export const L60_IDLE = {
  workStatus: 'idle',
  battery: 64,
  errorCode: 0,
  cleaningStrength: 'Standard',
};

/**
 * A fake SDK `Device`: accessors returning bound objects built from `state`
 * (a getter exists only when its value is set) and recording every write.
 * `commands` lists the writes it offers, like the SDK's availability gates.
 */
export function fakeDevice(record, state, { commands = [] } = {}) {
  const calls = [];
  const has = (key) => state[key] !== undefined;
  const offered = new Set(commands);
  const write =
    (name, effect) =>
    async (...args) => {
      calls.push([name, ...args]);
      effect?.(...args);
    };
  const clean = () => {
    const bound = {};
    for (const key of [
      'activity',
      'workStatus',
      'chargeState',
      'triggerSource',
      'battery',
      'errorCode',
      'cleanType',
      'cleanExtent',
      'mopLevel',
      'cleaningStrength',
      'sideBrushHours',
      'rollingBrushHours',
      'filterHours',
      'mopHours',
      'sensorHours',
      'scraperHours',
      'dustBagHours',
      'clearTime',
      'clearArea',
    ]) {
      if (has(key)) {
        Object.defineProperty(bound, key, { get: () => state[key], enumerable: true });
      }
    }
    for (const name of [
      'startCleaning',
      'pauseCleaning',
      'resumeCleaning',
      'returnToDock',
      'setCleanParam',
    ]) {
      if (offered.has(name)) {
        bound[name] = write(name);
      }
    }
    return bound;
  };
  const device = {
    sn: record.sn,
    name: record.name,
    model: record.model,
    calls,
    state,
    vacuumClean: () => clean(),
  };
  if (offered.has('setSuctionLevel') || has('suctionLevel')) {
    device.suction = () => {
      const bound = {};
      if (has('suctionLevel')) {
        Object.defineProperty(bound, 'level', { get: () => state.suctionLevel });
      }
      if (has('supportedLevels')) {
        bound.supportedLevels = state.supportedLevels;
      }
      if (offered.has('setSuctionLevel')) {
        bound.setSuctionLevel = write('setSuctionLevel');
      }
      return bound;
    };
  }
  if (offered.has('locate')) {
    device.locate = () => ({ locate: write('locate') });
  }
  return device;
}

/** The writes the SDK offers on an AIoT robot (X-series). */
export const AIOT_COMMANDS = [
  'startCleaning',
  'pauseCleaning',
  'resumeCleaning',
  'returnToDock',
  'setCleanParam',
  'setSuctionLevel',
  'locate',
];
