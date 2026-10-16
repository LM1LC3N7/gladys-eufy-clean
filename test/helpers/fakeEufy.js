// -----------------------------------------------------------------------------
// A fake eufy cloud behind the client factory of src/eufy.js: the SDK's
// `EufyMega` surface the app uses (login -> ok | captcha | 2fa, solveCaptcha,
// submitVerifyCode, getDevices, getDevice, waitForRealtime, disconnect,
// clearSession, and its events), with the robots of test/fixtures/robots.js.
// The real SDK is only touched by test/eufy.test.js, without network.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import {
  ACCOUNT,
  AIOT_COMMANDS,
  CAPTCHA,
  CAPTCHA_IMAGE,
  CODE,
  L60,
  L60_IDLE,
  X10,
  X10_DOCKED,
  fakeDevice,
} from '../fixtures/robots.js';

/** What the SDK throws when the gateway answers a non-zero envelope code. */
export class ApiError extends Error {
  constructor(message, code, status = 200) {
    super(message);
    this.name = 'MegaApiError';
    this.code = code;
    this.status = status;
  }
}

export class ExpiredError extends Error {
  constructor(message, retryAfterMs = 0) {
    super(message);
    this.name = 'SessionExpiredError';
    this.retryAfterMs = retryAfterMs;
  }
}

const OK = { status: 'ok', session: { userId: 'u1', authToken: 'token' } };
const READY = {
  state: 'ready',
  push: { required: 1, ready: 1, failed: 0, pending: 0 },
  mqtt: { required: 1, ready: 1, failed: 0, pending: 0 },
  wiredP2p: { required: 0, ready: 0, failed: 0, pending: 0 },
};

class FakeClient extends EventEmitter {
  constructor(world, config, options) {
    super();
    this.world = world;
    this.config = config;
    this.options = options;
    this.pending2fa = false;
    this.disconnects = 0;
  }

  async login() {
    const world = this.world;
    world.logins += 1;
    const failure = world.failures.shift();
    if (failure) {
      throw failure;
    }
    if (world.sessionStored && !this.pending2fa) {
      return OK;
    }
    if (world.needsCaptcha && !world.captchaSolved) {
      return { status: 'captcha', image: CAPTCHA_IMAGE, retry: false };
    }
    return this.afterPassword();
  }

  afterPassword() {
    if (this.world.needsCode) {
      this.pending2fa = true;
      this.world.codesSent += 1;
      return { status: '2fa', method: 'code sent via app-push/sendmsg/verify_code' };
    }
    this.world.sessionStored = true;
    return OK;
  }

  async solveCaptcha(answer) {
    this.world.answers.push(answer);
    if (answer !== CAPTCHA) {
      return { status: 'captcha', image: CAPTCHA_IMAGE, retry: true };
    }
    this.world.captchaSolved = true;
    return this.afterPassword();
  }

  async submitVerifyCode(code) {
    this.world.codes.push(code);
    if (!this.pending2fa) {
      throw new Error('no verification pending');
    }
    if (code !== CODE) {
      throw new ApiError('/passport/login failed (200/100006): verify code error', 100006);
    }
    this.pending2fa = false;
    this.world.sessionStored = true;
    return OK;
  }

  async getDevices() {
    this.world.listCalls += 1;
    const failure = this.world.listFailures.shift();
    if (failure) {
      throw failure;
    }
    return this.world.list;
  }

  async getDevice(sn) {
    const device = this.world.devices.get(sn);
    if (!device) {
      throw new Error(`unknown device ${sn}`);
    }
    return device;
  }

  async waitForRealtime() {
    return this.world.realtime;
  }

  async disconnect() {
    this.disconnects += 1;
  }

  clearSession() {
    this.world.sessionStored = false;
    this.world.cleared += 1;
  }
}

/** The state file of src/store.js, in memory. */
export function memoryStore(initial = null) {
  return {
    data: initial,
    saves: 0,
    async load() {
      return this.data === null ? null : structuredClone(this.data);
    },
    async save(data) {
      this.saves += 1;
      this.data = structuredClone(data);
    },
  };
}

/** Lets the pending promises settle (no timer involved). */
export const settle = async (rounds = 20) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/**
 * The client factory, and the world behind it (`factory.world`): the robots,
 * what the account asks for at sign-in, and every client built.
 */
export function fakeEufy({
  needsCode = true,
  needsCaptcha = false,
  sessionStored = false,
  list = ACCOUNT,
  x10 = X10_DOCKED,
  realtime = READY,
} = {}) {
  const world = {
    needsCode,
    needsCaptcha,
    captchaSolved: false,
    sessionStored,
    list,
    realtime,
    devices: new Map([
      [X10.sn, fakeDevice(X10, { ...x10 }, { commands: AIOT_COMMANDS })],
      [L60.sn, fakeDevice(L60, { ...L60_IDLE })],
    ]),
    clients: [],
    logins: 0,
    codesSent: 0,
    codes: [],
    answers: [],
    cleared: 0,
    listCalls: 0,
    failures: [],
    listFailures: [],
  };
  const factory = (config, options) => {
    const client = new FakeClient(world, config, options);
    world.clients.push(client);
    return client;
  };
  factory.world = world;
  /** The client in use. */
  world.client = () => world.clients.at(-1);
  /** A robot reports over MQTT: its live state changes, the SDK announces it. */
  world.report = (sn, patch) => {
    Object.assign(world.devices.get(sn).state, patch);
    for (const property of Object.keys(patch)) {
      world.client().emit('propertyChanged', { deviceSn: sn, property });
    }
  };
  return factory;
}
