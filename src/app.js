// -----------------------------------------------------------------------------
// EufyCleanApp: the eufy account, its robot vacuums, and Gladys.
//
// Sign-in: the SDK's state machine (`login` -> ok | captcha | 2fa), the
// captcha answer and the verification code typed in the configuration. The
// session lives in /data, so a restart neither signs in again nor asks for a
// new code. Robots report over secure MQTT: a report schedules a read of the
// robot's live state (no request), whose changes go to Gladys; a 60 s refresh
// covers a missed one. Commands go through the SDK's confirmed writes only.
// -----------------------------------------------------------------------------

import { DATA_DIR, GLADYS, SCENE_TRIGGERS, SUCTION_LEVELS, TIMINGS } from './constants.js';
import { createEufyClient, isRefusal } from './eufy.js';
import {
  buildDevice,
  mergeRoles,
  parseFeatureId,
  parseDeviceId,
  robotIds,
  robotStates,
  rolesOf,
} from './devices.js';
import { track } from './events.js';
import { faultText } from './faults.js';
import { normalizeConfig } from './config.js';
import { ACTIVITY_NAMES, COMMAND_ERRORS, STATUS, TEST, word } from './i18n.js';
import { Publisher } from './publisher.js';
import { readRobot, robotsOf, runCommand } from './robot.js';
import { fileStore, normalizeMemory } from './store.js';

const { VACUUM_RUN_MODE: RUN, VACUUM_CLEAN_MODE: MODE } = GLADYS;

/** clean-mode -> the SDK's clean type. */
const CLEAN_TYPES = {
  [MODE.AUTO]: 'sweepAndMop',
  [MODE.VACUUM]: 'sweep',
  [MODE.MOP]: 'mop',
};

const minutes = (ms) => Math.max(1, Math.round(ms / 60_000));

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

export class EufyCleanApp {
  constructor({
    gladys,
    logger = silentLogger,
    createClient = createEufyClient,
    store = fileStore(),
    dataDir = DATA_DIR,
    now = Date.now,
    timers = globalThis,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.createClient = createClient;
    this.store = store;
    this.dataDir = dataDir;
    this.now = now;
    this.timers = timers;
    this.publisher = new Publisher({ gladys, logger, now, timers });
    this.config = normalizeConfig({});
    this.memory = normalizeMemory(null);
    this.client = undefined;
    /** idle | connecting | captcha | 2fa | connected | refused | waiting */
    this.phase = 'idle';
    this.generation = 0;
    /** serial -> { info, device, reading, roles, job, timer, available } */
    this.robots = new Map();
    this.ignored = 0;
    this.realtime = undefined;
    this.retryDelay = TIMINGS.retryMin;
    this.retryTimer = undefined;
    this.refreshTimer = undefined;
    this.started = false;
  }

  // --- lifecycle -------------------------------------------------------------

  /** First connection to Gladys: start. A reconnection: send everything again. */
  async connected(rawConfig) {
    if (!this.started) {
      this.started = true;
      this.publisher.start();
      this.memory = normalizeMemory(await this.store.load());
      await this.start(rawConfig);
      return;
    }
    this.gladys.forgetPublishedStates?.();
    if (this.phase === 'connected') {
      await this.publishDevices();
      this.pushAllStates();
    }
  }

  async configUpdated(rawConfig) {
    const next = normalizeConfig(rawConfig);
    const previous = this.config;
    const restart =
      next.credentials !== previous.credentials ||
      next.countryInvalid !== previous.countryInvalid ||
      !['connected', 'captcha', '2fa'].includes(this.phase);
    if (restart) {
      await this.start(rawConfig);
      return;
    }
    this.config = next;
    if (next.language !== previous.language && this.phase === 'connected') {
      await this.publishDevices();
      this.pushAllStates();
    }
    // Only a newly typed answer or code is sent (a value left in the form from
    // an earlier sign-in is spent), then the field is emptied.
    if (this.phase === 'captcha' && next.captcha && next.captcha !== previous.captcha) {
      this.config = { ...next, captcha: '' };
      await this.clearField('captcha_answer');
      await this.follow(this.client.solveCaptcha(next.captcha), this.generation, 'captcha');
    } else if (this.phase === '2fa' && next.code && next.code !== previous.code) {
      this.config = { ...next, code: '' };
      await this.clearField('verification_code');
      await this.follow(this.client.submitVerifyCode(next.code), this.generation, '2fa');
    }
  }

  async stop() {
    this.generation += 1;
    this.publisher.stop();
    this.clearTimers();
    await this.dropClient();
  }

  clearTimers() {
    for (const name of ['retryTimer', 'refreshTimer']) {
      if (this[name]) {
        this.timers.clearTimeout(this[name]);
        this.timers.clearInterval(this[name]);
        this[name] = undefined;
      }
    }
    for (const robot of this.robots.values()) {
      if (robot.timer) {
        this.timers.clearTimeout(robot.timer);
        robot.timer = undefined;
      }
    }
  }

  async dropClient() {
    const client = this.client;
    this.client = undefined;
    this.realtime = undefined;
    if (client) {
      client.removeAllListeners?.();
      // An EventEmitter without an `error` listener throws: keep one.
      client.on?.('error', () => {});
      try {
        await client.disconnect();
      } catch (err) {
        this.logger.debug(`eufy disconnect: ${err.message}`);
      }
    }
  }

  /** (Re)starts from the configuration: a new client, then the sign-in. */
  async start(rawConfig) {
    this.generation += 1;
    const generation = this.generation;
    this.clearTimers();
    await this.dropClient();
    this.rawConfig = rawConfig;
    this.config = normalizeConfig(rawConfig);
    this.retryDelay = TIMINGS.retryMin;
    if (!this.config.complete) {
      this.phase = 'idle';
      await this.status(false, STATUS.missing);
      return;
    }
    if (this.config.countryInvalid) {
      this.phase = 'idle';
      await this.status(false, STATUS.badCountry);
      return;
    }
    let client;
    try {
      client = this.createClient(this.config, { dataDir: this.dataDir, logger: this.logger });
    } catch (err) {
      this.logger.error(`The eufy client could not start: ${err.message}`);
      return this.retry(generation, STATUS.retrying);
    }
    this.client = client;
    if (this.memory.account !== this.config.account) {
      // Another account: its session, its robots.
      client.clearSession?.();
      this.memory = { account: this.config.account, roles: {} };
      this.robots.clear();
      await this.saveMemory();
    }
    this.listen(client, generation);
    await this.signIn(generation);
  }

  async signIn(generation) {
    if (generation !== this.generation || !this.client) {
      return;
    }
    this.phase = 'connecting';
    await this.status(false, STATUS.connecting);
    await this.follow(this.client.login(), generation, 'login');
  }

  /** Waits for one step of the sign-in and moves the state machine on. */
  async follow(step, generation, kind) {
    let result;
    try {
      result = await step;
    } catch (err) {
      if (generation === this.generation) {
        await this.signInFailed(err, generation, kind);
      }
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    if (result?.status === 'ok') {
      await this.signedIn(generation);
    } else if (result?.status === 'captcha') {
      this.phase = 'captcha';
      this.logger.warn(
        'eufy asks for a captcha: paste the next line into the address bar of a browser, then type the 4 characters in "Captcha answer" and save.',
      );
      this.logger.warn(String(result.image ?? ''));
      await this.status(false, result.retry ? STATUS.captchaRetry : STATUS.captcha);
    } else if (result?.status === '2fa') {
      this.phase = '2fa';
      await this.status(false, kind === 'code-refused' ? STATUS.codeRefused : STATUS.code);
    } else {
      await this.signInFailed(new Error(`unexpected sign-in answer ${result?.status}`), generation);
    }
  }

  async signInFailed(err, generation, kind) {
    const code = err?.code !== undefined ? ` (code ${err.code})` : '';
    if (kind === '2fa' && isRefusal(err)) {
      // A wrong or expired code: ask for a new one.
      this.logger.warn(`eufy refused the verification code${code}`);
      await this.follow(this.client.login(), generation, 'code-refused');
      return;
    }
    if (isRefusal(err)) {
      this.logger.error(`eufy refused the sign-in${code}: ${err.message}`);
      this.phase = 'refused';
      await this.status(false, STATUS.refused);
      return;
    }
    this.logger.warn(`eufy sign-in failed${code}: ${err?.message}`);
    await this.retry(generation, STATUS.retrying);
  }

  /** Signs in again later, waiting longer each time (1 min to 15 min). */
  async retry(generation, message, delay = this.retryDelay) {
    if (generation !== this.generation) {
      return;
    }
    this.phase = 'waiting';
    this.retryDelay = Math.min(TIMINGS.retryMax, delay * 2);
    await this.status(false, typeof message === 'function' ? message(minutes(delay)) : message);
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = undefined;
      // No client means building it failed: start over from the configuration.
      const next = this.client ? this.signIn(generation) : this.start(this.rawConfig);
      next.catch((err) => this.logger.error('eufy sign-in', err));
    }, delay);
  }

  async signedIn(generation) {
    this.phase = 'connected';
    this.retryDelay = TIMINGS.retryMin;
    this.logger.info('Signed in to eufy');
    try {
      await this.loadRobots(generation);
    } catch (err) {
      if (generation === this.generation) {
        await this.signInFailed(err, generation);
      }
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    await this.status(true, STATUS.connected(this.robots.size));
    this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = this.timers.setInterval(() => this.refreshAll(), TIMINGS.refreshInterval);
    this.watchRealtime(generation);
  }

  /** Secure MQTT comes up in the background: report when it does not. */
  watchRealtime(generation) {
    const client = this.client;
    Promise.resolve(client.waitForRealtime?.({ timeoutMs: TIMINGS.realtimeWait }))
      .then(async (readiness) => {
        if (generation !== this.generation || this.phase !== 'connected') {
          return;
        }
        this.realtime = readiness;
        const mqtt = readiness?.mqtt;
        const down = mqtt && (mqtt.failed > 0 || mqtt.pending > 0);
        if (down && this.robots.size > 0) {
          this.logger.warn('The eufy real-time channel (MQTT) did not open, trying again');
          await this.status(true, STATUS.noRealtime);
          this.timers.clearTimeout(this.retryTimer);
          this.retryTimer = this.timers.setTimeout(() => {
            this.retryTimer = undefined;
            this.restartRealtime(generation).catch((err) =>
              this.logger.error('eufy realtime', err),
            );
          }, this.retryDelay);
          this.retryDelay = Math.min(TIMINGS.retryMax, this.retryDelay * 2);
        }
      })
      .catch((err) => this.logger.warn(`eufy real time: ${err.message}`));
  }

  /** Closes the channels and signs in again from the kept session (no code). */
  async restartRealtime(generation) {
    if (generation !== this.generation || !this.client) {
      return;
    }
    await this.client.disconnect();
    const result = await this.client.login();
    if (generation === this.generation && result?.status === 'ok') {
      await this.status(true, STATUS.connected(this.robots.size));
      this.watchRealtime(generation);
    }
  }

  listen(client, generation) {
    const mine = (handler) => (payload) => {
      if (generation === this.generation) {
        handler(payload);
      }
    };
    client.on(
      'error',
      mine((err) => this.logger.warn(`eufy: ${err?.message ?? err}`)),
    );
    client.on(
      'propertyChanged',
      mine((event) => this.scheduleRead(event?.deviceSn)),
    );
    client.on(
      'deviceState',
      mine((state) => this.scheduleRead(state?.sn)),
    );
    client.on(
      'deviceCapabilities',
      mine((info) => this.scheduleRead(info?.deviceSn)),
    );
    client.on(
      'availability',
      mine((observation) => this.availability(observation)),
    );
    const listChanged = mine((device) => {
      if (device?.deviceClass === 'vacuum' && this.phase === 'connected') {
        this.loadRobots(generation).catch((err) =>
          this.logger.warn(`eufy devices: ${err.message}`),
        );
      }
    });
    client.on('deviceAdded', listChanged);
    client.on('deviceRemoved', listChanged);
    client.on(
      'commandUnconfirmed',
      mine((info) => this.logger.warn(`The robot ${info?.sn} did not confirm "${info?.property}"`)),
    );
    client.on(
      'sessionExpired',
      mine((err) => {
        if (this.phase !== 'connected') {
          return;
        }
        this.logger.warn(`The eufy session ended: ${err?.message}`);
        const delay = Math.max(TIMINGS.retryMin, Number(err?.retryAfterMs) || 0);
        this.retry(generation, STATUS.sessionEnded, delay).catch(() => {});
      }),
    );
  }

  // --- robots ----------------------------------------------------------------

  /** The robot vacuums of the account, their live objects and first readings. */
  async loadRobots(generation) {
    const { robots, ignored } = robotsOf(await this.client.getDevices());
    if (generation !== this.generation) {
      return;
    }
    this.ignored = ignored;
    const kept = new Map();
    for (const info of robots) {
      const known = this.robots.get(info.sn);
      // The SDK holds the robots it hands out weakly: this map keeps them alive.
      const device = await this.client.getDevice(info.sn);
      if (generation !== this.generation) {
        return;
      }
      kept.set(info.sn, {
        info,
        device,
        reading: known?.reading,
        roles: mergeRoles(this.memory.roles[info.sn] ?? [], known?.roles ?? []),
        job: known?.job,
        timer: known?.timer,
        available: known?.available,
      });
    }
    for (const [sn, robot] of this.robots) {
      if (!kept.has(sn) && robot.timer) {
        this.timers.clearTimeout(robot.timer);
      }
    }
    this.robots = kept;
    for (const [sn, robot] of kept) {
      this.apply(sn, readRobot(robot.device));
    }
    await this.saveMemory();
    await this.publishDevices();
  }

  scheduleRead(sn) {
    const robot = this.robots.get(sn);
    if (!robot || robot.timer) {
      return;
    }
    robot.timer = this.timers.setTimeout(() => {
      robot.timer = undefined;
      this.readOne(sn).catch((err) => this.logger.warn(`Reading ${sn}: ${err.message}`));
    }, TIMINGS.readDelay);
  }

  refreshAll() {
    for (const sn of this.robots.keys()) {
      this.readOne(sn).catch((err) => this.logger.warn(`Reading ${sn}: ${err.message}`));
    }
  }

  async readOne(sn) {
    const robot = this.robots.get(sn);
    if (!robot || this.phase !== 'connected') {
      return;
    }
    const grown = this.apply(sn, readRobot(robot.device));
    if (grown) {
      await this.saveMemory();
      await this.publishDevices();
    }
  }

  /**
   * Takes a new reading of a robot: features seen, job, scene events, states.
   * Returns whether its device gained features (new ones get their states once
   * the user updates the device from Discovery).
   */
  apply(sn, reading) {
    const robot = this.robots.get(sn);
    const roles = mergeRoles(robot.roles, rolesOf(reading));
    const grown = roles.length !== robot.roles.length;
    robot.roles = roles;
    this.memory.roles[sn] = roles;
    const { job, events } = track(robot.reading, reading, robot.job, this.now());
    robot.job = job;
    robot.reading = reading;
    if (this.isCreated(sn)) {
      this.pushStates(robot);
      for (const event of events) {
        this.fire(robot, event);
      }
    }
    return grown;
  }

  fire(robot, event) {
    const ids = robotIds(this.gladys, robot.info.sn);
    const name = this.deviceName(robot);
    if (event.type === 'finished') {
      this.publisher.pushSceneEvent(SCENE_TRIGGERS.CLEANING_FINISHED, {
        robot: ids.device,
        robot_name: name,
        duration: event.minutes,
        area: event.area,
      });
    } else if (event.type === 'error') {
      this.publisher.pushSceneEvent(SCENE_TRIGGERS.ROBOT_ERROR, {
        robot: ids.device,
        robot_name: name,
        error_code: event.code,
        error_message: faultText(event.code, this.config.language),
      });
    }
  }

  availability(observation) {
    const sn = observation?.entity?.sn;
    const robot = this.robots.get(sn);
    if (!robot) {
      return;
    }
    robot.available = observation.availability !== 'unavailable';
    if (this.isCreated(sn)) {
      const transport = robot.available ? 'cloud' : 'unreachable';
      this.gladys
        .publishTransports([{ external_id: robotIds(this.gladys, sn).device, transport }])
        .catch((err) => this.logger.warn(`Transport badge: ${err.message}`));
    }
    this.scheduleRead(sn);
  }

  // --- Gladys ----------------------------------------------------------------

  isCreated(sn) {
    const id = robotIds(this.gladys, sn).device;
    return (this.gladys.devices ?? []).some((d) => d.external_id === id);
  }

  deviceName(robot) {
    const id = robotIds(this.gladys, robot.info.sn).device;
    const created = (this.gladys.devices ?? []).find((d) => d.external_id === id);
    return (
      created?.name ??
      buildDevice(this.gladys, robot.info, [], undefined, this.config.language).name
    );
  }

  async publishDevices() {
    const devices = [...this.robots.values()].map((robot) =>
      buildDevice(this.gladys, robot.info, robot.roles, robot.reading, this.config.language),
    );
    await this.gladys.publishDiscoveredDevices(devices);
  }

  pushStates(robot) {
    const ids = robotIds(this.gladys, robot.info.sn);
    for (const state of robotStates(ids, robot.reading, robot.roles, this.config.language)) {
      this.publisher.push(state);
    }
  }

  pushAllStates() {
    for (const [sn, robot] of this.robots) {
      if (robot.reading && this.isCreated(sn)) {
        this.pushStates(robot);
      }
    }
  }

  async scan() {
    if (this.phase === 'connected') {
      await this.loadRobots(this.generation);
    } else {
      await this.publishDevices();
    }
  }

  async deviceCreated(device) {
    const sn = parseDeviceId(device?.external_id);
    const robot = this.robots.get(sn);
    if (robot?.reading) {
      this.pushStates(robot);
      await this.publisher.flush().catch(() => {});
    }
  }

  async deviceDeleted(device) {
    if (device?.external_id) {
      this.publisher.forget(device.external_id);
    }
  }

  async status(connected, message) {
    this.lastStatus = message;
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      this.logger.warn(`Connection status: ${err.message}`);
    }
  }

  async clearField(key) {
    try {
      await this.gladys.setConfig({ [key]: '' });
    } catch (err) {
      this.logger.debug(`Clearing ${key}: ${err.message}`);
    }
  }

  async saveMemory() {
    try {
      await this.store.save(this.memory);
    } catch (err) {
      this.logger.warn(`Saving the state in /data failed: ${err.message}`);
    }
  }

  // --- commands --------------------------------------------------------------

  async setValue(_device, feature, value) {
    const parsed = parseFeatureId(feature?.external_id);
    if (!parsed) {
      throw new Error(COMMAND_ERRORS.unknownRobot);
    }
    if (this.phase !== 'connected' || !this.client) {
      throw new Error(COMMAND_ERRORS.notConnected);
    }
    const robot = this.robots.get(parsed.sn);
    if (!robot) {
      throw new Error(COMMAND_ERRORS.unknownRobot);
    }
    const ran = await this.command(robot, parsed.role, value);
    if (!ran) {
      throw new Error(COMMAND_ERRORS.unsupported);
    }
    this.logger.info(`${parsed.role} = ${value} sent to ${robot.info.sn}`);
    // The robot answers over MQTT: read it again soon after.
    this.scheduleRead(parsed.sn);
  }

  async command(robot, role, value) {
    const { device } = robot;
    const reading = robot.reading ?? readRobot(device);
    switch (role) {
      case 'run-mode': {
        const mode = Number(value);
        if (mode === RUN.CLEANING) {
          if (reading.activity === 'paused' && reading.commands.resume) {
            return runCommand(device, 'vacuumClean', 'resumeCleaning');
          }
          return runCommand(device, 'vacuumClean', 'startCleaning');
        }
        if (mode === RUN.IDLE) {
          // No confirmed "stop" in the SDK: pause, the dock ends the job.
          if (['cleaning', 'returning'].includes(reading.activity)) {
            return runCommand(device, 'vacuumClean', 'pauseCleaning');
          }
          return true;
        }
        throw new Error(COMMAND_ERRORS.badValue);
      }
      case 'dock':
        return runCommand(device, 'vacuumClean', 'returnToDock');
      case 'clean-mode': {
        const cleanType = CLEAN_TYPES[Number(value)];
        if (!cleanType) {
          throw new Error(COMMAND_ERRORS.badValue);
        }
        return runCommand(
          device,
          'vacuumClean',
          'setCleanParam',
          cleanType,
          reading.cleanExtent ?? 'normal',
          reading.mopLevel ?? 'middle',
        );
      }
      case 'suction': {
        const level = SUCTION_LEVELS.find((s) => s.value === String(value))?.level;
        if (level === undefined || !reading.suction.levels.includes(level)) {
          throw new Error(COMMAND_ERRORS.badValue);
        }
        return runCommand(device, 'suction', 'setSuctionLevel', level);
      }
      case 'locate':
        return runCommand(device, 'locate', 'locate', true);
      default:
        return false;
    }
  }

  // --- test button -----------------------------------------------------------

  async testConnection() {
    const lines = { en: [], fr: [] };
    const add = (texts) => {
      lines.en.push(texts.en);
      lines.fr.push(texts.fr);
    };
    if (this.phase !== 'connected') {
      const message = this.lastStatus ?? STATUS.missing;
      add({
        en: `${TEST.notConnected.en}: ${message.en}`,
        fr: `${TEST.notConnected.fr} : ${message.fr}`,
      });
      return { en: lines.en.join('\n'), fr: lines.fr.join('\n') };
    }
    add({ en: `${TEST.title.en}: OK`, fr: `${TEST.title.fr} : OK` });
    if (this.robots.size === 0) {
      add({ en: `${TEST.robots.en}: ${TEST.none.en}`, fr: `${TEST.robots.fr} : ${TEST.none.fr}` });
    }
    for (const robot of this.robots.values()) {
      const reading = robot.reading ?? readRobot(robot.device);
      for (const lang of ['en', 'fr']) {
        const sep = lang === 'fr' ? ' : ' : ': ';
        const activity =
          reading.activity === undefined
            ? word(TEST.waiting, lang)
            : word(
                ACTIVITY_NAMES[
                  reading.activity === 'docked' && reading.charging ? 'charging' : reading.activity
                ],
                lang,
              );
        const parts = [activity];
        if (reading.battery !== undefined) {
          parts.push(`${reading.battery} %`);
        }
        if (reading.errorCode) {
          parts.push(faultText(reading.errorCode, lang));
        }
        if (!reading.commands.start) {
          parts.push(word(TEST.readOnly, lang));
        }
        const name = robot.info.name || robot.info.model;
        lines[lang].push(`${name} (${robot.info.model})${sep}${parts.join(', ')}`);
      }
    }
    if (this.ignored > 0) {
      add(TEST.ignored(this.ignored));
    }
    const mqtt = this.realtime?.mqtt;
    if (mqtt && mqtt.required > 0) {
      const up = mqtt.ready >= mqtt.required;
      add({
        en: `${TEST.realtime.en}: ${up ? TEST.realtimeUp.en : TEST.realtimeDown.en}`,
        fr: `${TEST.realtime.fr} : ${up ? TEST.realtimeUp.fr : TEST.realtimeDown.fr}`,
      });
    }
    return { en: lines.en.join('\n'), fr: lines.fr.join('\n') };
  }
}
