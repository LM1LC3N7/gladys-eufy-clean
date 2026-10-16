// -----------------------------------------------------------------------------
// Constants: the Gladys core enums the SDK does not export, the manifest keys,
// the consumables, the timings and the limits.
// -----------------------------------------------------------------------------

/**
 * Gladys core values (server/utils/constants.js): the SDK exports the
 * categories, types and units, not the values. Checked against Gladys master
 * of 2026-10-16 (VACUUM_CLEANER_STATE, VACUUM_CLEANER_MODE,
 * VACUUM_CLEANER_CLEAN_MODE).
 */
export const GLADYS = {
  VACUUM_STATE: {
    STOPPED: 0,
    RUNNING: 1,
    PAUSED: 2,
    ERROR: 3,
    RETURNING_TO_DOCK: 4,
    CHARGING: 5,
    DOCKED: 6,
  },
  VACUUM_RUN_MODE: { IDLE: 0, CLEANING: 1, MAPPING: 2 },
  VACUUM_CLEAN_MODE: {
    AUTO: 0,
    QUICK: 1,
    QUIET: 2,
    LOW_NOISE: 3,
    DEEP_CLEAN: 4,
    VACUUM: 5,
    MOP: 6,
  },
};

/** Manifest keys: frozen, users store them in scenes. */
export const ACTIONS = { TEST_CONNECTION: 'test_connection' };

export const SCENE_TRIGGERS = {
  CLEANING_FINISHED: 'cleaning_finished',
  ROBOT_ERROR: 'robot_error',
};

/**
 * The robot's activity, as the eufy SDK decodes it (`VacuumActivity`):
 * `unknown` is read as "no reading".
 */
export const ACTIVITIES = ['idle', 'error', 'docked', 'cleaning', 'returning', 'paused'];

/**
 * Suction levels of the eufy SDK (`SuctionLevel`, DP 158): number on the
 * wire, string option in Gladys (`text`/`select`, values frozen).
 */
export const SUCTION_LEVELS = [
  { level: 0, value: 'quiet' },
  { level: 1, value: 'standard' },
  { level: 2, value: 'turbo' },
  { level: 3, value: 'max' },
  { level: 4, value: 'boost_iq' },
  { level: 5, value: 'max_pro' },
];

/** The levels offered when the robot's catalog lists none. */
export const DEFAULT_SUCTION_LEVELS = [0, 1, 2, 3];

/**
 * Consumables: the hours-used counter the SDK decodes from DP 168
 * (ConsumableRuntime) and the life of each part in hours, from
 * jeppesens/eufy-clean `ACCESSORY_MAX_LIFE` (X-series, MIT), the values the
 * Home Assistant integration turns into "life remaining". The dust bag and
 * the dock tanks have no documented life: not exposed.
 */
export const CONSUMABLES = [
  { role: 'side-brush', member: 'sideBrushHours', lifeHours: 180 },
  { role: 'rolling-brush', member: 'rollingBrushHours', lifeHours: 360 },
  { role: 'filter', member: 'filterHours', lifeHours: 360 },
  { role: 'mop', member: 'mopHours', lifeHours: 180 },
  { role: 'sensors', member: 'sensorHours', lifeHours: 60 },
  { role: 'scraper', member: 'scraperHours', lifeHours: 30 },
];

export const TIMINGS = {
  /** A report starts a read of the robot this long after (reports come in bursts). */
  readDelay: 2_000,
  /** Every robot is read again this often, without any request (live state). */
  refreshInterval: 60_000,
  /** Sign-in retries after a transient failure: 1 min, doubling, up to 15 min. */
  retryMin: 60_000,
  retryMax: 15 * 60_000,
  /** How long the realtime channel (secure MQTT) may take to come up. */
  realtimeWait: 120_000,
  /**
   * The SDK's read-through cache: robots report on change over MQTT, their
   * cloud record holds none of their state. (The SDK also reads the device
   * list every 10 minutes by itself and announces a robot added or removed.)
   */
  cacheTtl: 10 * 60_000,
  /** Publisher: flush every second, unchanged values sent again every 30 min. */
  flushInterval: 1_000,
  stateHeartbeat: 30 * 60_000,
};

export const LIMITS = {
  statesPerMinute: 300,
  sceneEventsPerMinute: 300,
  statesPerRequest: 100,
  queuedEvents: 500,
};

/** Files under /data, the only writable place of the container. */
export const DATA_DIR = '/data';
export const FILES = {
  session: 'eufy-session.json',
  state: 'eufy-clean-state.json',
};
