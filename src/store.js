// -----------------------------------------------------------------------------
// What must survive a restart besides the eufy session (which the SDK keeps
// in /data/eufy-session.json), in /data/eufy-clean-state.json:
//   - the account the session belongs to (a hash of the e-mail address and
//     the country): another account starts from a clean session;
//   - the features each robot has shown, so a restart before the robot's
//     first report does not take features away from its device.
// -----------------------------------------------------------------------------

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, FILES } from './constants.js';
import { ROLES } from './devices.js';

export function fileStore(path = join(DATA_DIR, FILES.state)) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return null;
      }
    },
    async save(data) {
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, path);
    },
  };
}

/** The persisted state, repaired: `{ account, roles: { serial: [role…] } }`. */
export function normalizeMemory(raw) {
  const account = typeof raw?.account === 'string' && raw.account !== '' ? raw.account : null;
  const roles = {};
  if (account && raw?.roles && typeof raw.roles === 'object') {
    for (const [sn, list] of Object.entries(raw.roles)) {
      if (Array.isArray(list)) {
        roles[sn] = ROLES.filter((role) => list.includes(role));
      }
    }
  }
  return { account, roles };
}
