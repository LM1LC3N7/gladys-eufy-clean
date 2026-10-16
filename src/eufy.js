// -----------------------------------------------------------------------------
// The only access to @mega-yfue/eufy-sdk (the eufy cloud: sign-in, device
// list, secure MQTT). Everything else talks to the client this file builds,
// so the tests replace this file's factory and never touch the network.
// -----------------------------------------------------------------------------

import { join } from 'node:path';
import {
  EufyMega,
  FileSessionStore,
  LoginStatus,
  MegaApiError,
  SessionExpiredError,
} from '@mega-yfue/eufy-sdk';
import { DATA_DIR, FILES, TIMINGS } from './constants.js';

export { LoginStatus, MegaApiError, SessionExpiredError };

/**
 * Robots only. After a sign-in, the SDK brings up three channels by itself:
 * secure MQTT (the robots' state and commands), an FCM push registration (the
 * camera events) and P2P sessions to the wired HomeBases and cameras. A
 * robot integration needs the first one only, and a P2P session would compete
 * with the one the eufy Security integration keeps to the same HomeBase: the
 * two others are switched off here. Both methods are internal to the SDK:
 * test/eufy.test.js fails when a new version renames them.
 */
export class RobotOnlyEufy extends EufyMega {
  /** No FCM push registration: nothing a robot reports goes through it. */
  async startPush() {
    return { close() {} };
  }

  /** No P2P session to the HomeBases and cameras of the account. */
  async warmWiredP2P(readiness) {
    if (readiness) {
      readiness.required = 0;
      readiness.pending = 0;
    }
    return readiness;
  }
}

/** The SDK's logger interface, onto ours (the SDK logs a lot at debug). */
export const sdkLogger = (logger) => ({
  debug: (message, ...args) => logger.debug(`[eufy-sdk] ${message}`, ...args),
  info: (message, ...args) => logger.debug(`[eufy-sdk] ${message}`, ...args),
  warn: (message, ...args) => logger.warn(`[eufy-sdk] ${message}`, ...args),
  error: (message, ...args) => logger.warn(`[eufy-sdk] ${message}`, ...args),
});

/**
 * A client for one eufy account. The session (token, ECDH key, install
 * identity) is kept in /data, so a restart signs in neither again nor
 * through a new verification code.
 */
export function createEufyClient(config, { dataDir = DATA_DIR, logger }) {
  return new RobotOnlyEufy({
    email: config.email,
    password: config.password,
    countryCode: config.country,
    openudid: config.installId,
    store: new FileSessionStore(join(dataDir, FILES.session)),
    logger: sdkLogger(logger),
    // Secure MQTT and the device-list poll are the SDK's; P2P to cameras is
    // switched off above, the LAN broadcast and the thumbnails are useless here.
    autoRealtime: true,
    noBroadcast: true,
    storedSnapshotCache: false,
    prewarmEvents: [],
    // Robots report on change over MQTT: the cloud record holds none of
    // their state, a fast read-through refresh would only cost requests.
    cacheTtlMs: TIMINGS.cacheTtl,
  });
}

/**
 * Whether a sign-in failure is eufy refusing it (a wrong password, an unknown
 * account, a refused code): no use retrying alone. The gateway answers those
 * with an envelope code (`MegaApiError.code`), often under HTTP 200; a network
 * failure, a gateway error (5xx) or a rate limit (429) is transient.
 */
export function isRefusal(err) {
  if (err instanceof SessionExpiredError || err?.name !== 'MegaApiError') {
    return false;
  }
  const status = Number(err.status);
  if (Number.isFinite(status) && (status >= 500 || status === 429 || status === 408)) {
    return false;
  }
  return Number.isFinite(Number(err.code)) && Number(err.code) !== 0;
}
