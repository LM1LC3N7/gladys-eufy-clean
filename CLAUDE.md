# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 24.5+, ESM, no build step) in its own sandboxed Docker
container, talking to Gladys through `@gladysassistant/integration-sdk`
(v0.15) and to the eufy cloud through `@mega-yfue/eufy-sdk` (pinned, see
TODO.md). It signs in to a eufy account (verification code and captcha typed
in the configuration), reads the account's robot vacuums, turns them into
Gladys devices and states from their secure MQTT reports, sends the commands
the SDK confirms, and fires scene events when a cleaning finishes or an error
appears. Robot vacuums only: cameras, locks and HomeBases belong to the eufy
Security integration. Unofficial, not affiliated with Anker or eufy.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit. The CI
runs on Node 24 only (the eufy SDK needs 24.5).

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          EufyCleanApp: sign-in state machine (ok | captcha | 2fa),
                    retries, robots, reads on MQTT reports, states, scene
                    events, commands, badges, test button
src/eufy.js         the only import of @mega-yfue/eufy-sdk: RobotOnlyEufy (no
                    FCM push, no camera P2P), the client factory, isRefusal
src/robot.js        the SDK's Device objects -> plain readings (pure, defensive)
src/devices.js      readings -> Gladys devices and states (pure)
src/events.js       two readings -> scene events (pure)
src/faults.js       fault codes -> texts (en/fr)
src/publisher.js    states within 300/min, scene events queued
src/store.js        /data/eufy-clean-state.json: account, features seen
src/config.js       config_schema normalized, account key, install id
src/constants.js    Gladys enums, manifest keys, consumables, timings
src/i18n.js         runtime texts, feature names, option labels (en/fr)
test/fixtures/      robots shaped after the SDK's declarations
test/helpers/       a fake eufy cloud behind the client factory; Gladys is the SDK's fake
test/eufy.test.js   the contract with the installed eufy SDK (no network)
```

## Rules

- **External ids are forever**: device = `robot:<serial>`, feature =
  `<device>:<role>` (roles in `src/devices.js` FEATURES). Never change how
  they are built.
- Manifest keys (`email`, `password`, `country`, `verification_code`,
  `captcha_answer`, `language`, `test_connection`, the two scene triggers,
  their fields and variables) and the suction option values (`quiet` …
  `max_pro`) are frozen: users store them in devices and scenes.
- Value conventions: the eufy side is the SDK's typed getters (activity
  names, suction 0-5, hours of use, seconds, m²); the Gladys side the enums
  of the core `server/utils/constants.js` (VACUUM_CLEANER_STATE / MODE /
  CLEAN_MODE), copied in `src/constants.js` since the SDK does not export
  them. Never send a unit Gladys does not accept for the category
  (test/devices.test.js holds the whitelist).
- **Only `src/eufy.js` imports the eufy SDK**, and only its documented
  surface plus the two overridden internals (checked by test/eufy.test.js).
  Read robots through their accessors at every reading (the SDK replaces the
  bound objects); keep the `Device` objects alive (the SDK holds them
  weakly). Never send a write the SDK marks unverified.
- **Sign-ins are precious**: rapid or failed logins make eufy ask for a
  captcha. A refusal stops until the configuration changes; transient errors
  back off 1 → 15 min; a session ended by eufy waits its `retryAfterMs`.
  Never log the password, the token or the verification code.
- Scene events go through `publisher.pushSceneEvent`, never deduplicated, and
  never on the first reading after a start.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network. Gladys rate limits: 300 states/min, 300 scene
  events/min.
- Tests never touch the network: the eufy client is a fake behind the
  factory; the real SDK is only constructed offline in test/eufy.test.js.
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
- Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md`; versions belong to the Release workflow.
