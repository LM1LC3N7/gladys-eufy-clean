# TODO — eufy Clean v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm run audit`, then update README, `docs/en.md`, `docs/fr.md`,
  `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic, the cover and the releases are
  handled when the module is published (Release workflow).
- No forum topic of its own, ever, and no forum post from a module session:
  the batch claimed in /t/10385 (post #224) gets one recap message there, with
  a link to each repo.

## Status

- [x] **Milestone 1 — core** (2026-10-16): eufy account (e-mail, password,
      country) through `@mega-yfue/eufy-sdk` 0.5.0-beta.54; verification
      code and captcha answer typed in the configuration (sent once, field
      emptied; captcha image in the logs); session in `/data`; own install
      identity; robots only (no FCM push, no P2P to cameras/HomeBases);
      backoff 1 → 15 min, refusal stops, session ended → sign-in after the
      SDK's delay; MQTT not up → status + retry. One device per robot vacuum
      (state, run-mode clean/pause/resume, dock, clean-mode on mop robots,
      suction `text`/`select`, battery, charging, error text + code, six
      consumables in `maintenance`, last job area/time, locate), features
      kept across restarts, transport badge from the SDK's availability.
      Scene triggers `cleaning_finished`, `robot_error`. Test button. Docs
      en/fr. Tested against simulated robots shaped after the SDK only.
- [ ] **Milestone 2 — real robot**: run against a real account and robot
      (see "To check on a real robot"), fix what differs, move to the stable
      `@mega-yfue/eufy-sdk` 0.5.0 when it ships.
- [ ] **Milestone 3 — more**:
  - **robot mowers** (T2880 E15, T2801 E18, T280B C15): the SDK resolves
    them with the `info` capability only in 0.5.0-beta.54 (no state, no
    command; its guide: "control surface not yet documented"); their state
    comes from Tuya DPs fixed in the 0.5.0 betas (issue #380, PR #416). Add
    them when the SDK models them; Gladys has no mower category (reuse
    `vacuum-cleaner` state + battery, or ask the core);
  - commands of the older `eufy_home_tuya` robots (G, L, X8…): the SDK
    refuses them unless `tuyaAllowUnverified` (Tuya write never captured);
    the older local-only RoboVacs (Tuya LAN protocol,
    `@george.talusan/eufy-robovac-js`) are another integration;
  - a real "stop" when the SDK confirms `stopCleaning` (method 12,
    unverified in 0.5.0-beta.54);
  - dock actions (empty dust, wash/dry mops) and dock state (`vacuumDock`,
    unconfirmed in the SDK); consumable resets (`resetConsumable`,
    unverified); mop water level, carpet strategy, clean extent;
  - rooms and saved scenes (`cleanRooms`, `startScene`, the map), as a
    `text`/`select` of rooms or scene actions;
  - a "consumable to replace" scene trigger, the cleaning history
    (`getCleanRecords`);
  - the dust bag and dock tanks: no documented lifetime, not exposed.
- [ ] **Milestone 4 — first release**: cover image, Docker image check,
      `npx github:GladysAssistant/integration-store .`, Release workflow,
      topic, GHCR package public.

## To check on a real robot

- Sign-in: which account types pass (e-mail/password; Google/Apple sign-in
  needs a password set), when eufy sends a code (first sign-in, new
  install identity?), the wording of a refused password (envelope code, HTTP
  status) — `isRefusal` treats any envelope code under a non-5xx status as a
  refusal; a captcha seen in practice.
- Sessions: does our own `openudid` keep the eufy app and the eufy Security
  integration signed in on the same account (the SDK says one session per
  account + install identity)? Does a shared (second) account receive the
  robot's MQTT reports and accept its commands?
- Reports: which getters a docked robot fills after `sendRealtimeInit`; how
  long a silent robot stays without state; `chargeState` while docked and
  full; `activity` during a mid-job recharge (returning → docked → cleaning):
  "Cleaning finished" fires at the first dock today (`events.js`).
- Commands: `startCleaning` (fixed in 0.5.0-beta.13 for the T2351),
  `pauseCleaning`, `resumeCleaning`, `returnToDock` on other X/L/C models;
  `setCleanParam` (write direction not captured by the SDK);
  `setSuctionLevel` with the robot's catalog levels; `locate(true)`.
- Values: hours of use per part (units, the scale of `filterHours` against
  the 360 h life), `clearTime` / `clearArea` of the current vs the last job,
  fault codes beyond jeppesens' table, `supportedLevels` per model.
- Memory: RSS with MQTT up and two robots. Measured 2026-10-16 without an
  account: image 225 MB (node-datachannel's prebuilt binary is ~20 MB of it),
  run read-only as `node` under 256 MB / 0.5 CPU, RSS 68 MB after loading
  the app and the SDK, 71 MB after a run of the app with the SDK's fake
  Gladys and a TLS request to the eufy cloud.

## Decisions

- **Not a duplicate** (checked 2026-10-16): no eufy Clean / RoboVac
  integration in the store index (main session: 433 entries), on GitHub or on
  the forum; the Gladys core has no eufy service.
  `cicoub13/gladys-eufy` ("eufy Security", in the store since 2026-10-09,
  same SDK) covers cameras, doorbells, sensors, locks, siren, HomeBase guard
  mode and battery levels; its README, re-read on 2026-10-16, lists
  "vacuums, lights and the other eufy appliances" as not supported. This
  module is its complement: robot vacuums only, cameras ignored, documented
  on both sides of our docs. Claimed by Louis in /t/10385 #224.
- **Dependency: `@mega-yfue/eufy-sdk`, used as is** (Louis's rule: reuse
  maintained work). Checked 2026-10-16: Apache-2.0; very active (stable
  0.2.0 → 0.4.0 between 2026-09-23 and 10-06, 0.5.0 betas daily, 748
  commits, maintainers max246 and lenoxys, contributor martijnpoppen, whose
  eufy-clean is the base of the jeppesens Home Assistant fork);
  issues answered within days (55 open, mostly cameras); Node ≥ 24.5;
  runtime deps `mqtt`, `protobufjs`, `jpeg-js` and, in 0.5, `node-datachannel`
  (native WebRTC, prebuilt for linux-x64/arm64 musl, loaded lazily only for a
  HomeBase S1 Pro); `npm audit` clean; importing it costs ~19 MB (RSS 47 → 66
  MB, read-only container, 256 MB / 0.5 CPU). ffmpeg is an external binary,
  only for camera snapshots: never called here.
- **Pinned to 0.5.0-beta.54, not 0.4.0**: the stable 0.4.0 cannot start a
  clean on the X-series (issue #346: `startCleaning` sends a bare ModeCtrl the
  T2351 ignores, fixed in 0.5.0-beta.13) and reads no Tuya-line robot (wrong
  Tuya shadow account, issue #380, fixed in the 0.5.0 betas). The exact
  version is pinned (no `^`): betas change daily; `test/eufy.test.js` checks
  every name the integration uses on the installed version. Move to 0.5.0
  stable as soon as it ships.
- **Robots only inside the SDK**: `RobotOnlyEufy` (src/eufy.js) overrides two
  internal methods, `startPush` (FCM push registration: camera events) and
  `warmWiredP2P` (P2P sessions to HomeBases and mains cameras, which would
  compete with the eufy Security integration's own session to the same
  HomeBase). Secure MQTT and the device-list poll stay the SDK's. The
  contract test fails if a new SDK version renames them. `noBroadcast` is
  set (no LAN broadcast from a bridge container), thumbnails off.
- **Install identity** (`openudid`): the SDK derives it from the e-mail
  only, so two integrations on one account would displace each other; ours
  is `md5("gladys-eufy-clean:" + e-mail)` (16 hex), stable across restarts.
- **Captcha**: the Gladys configuration screen has no image field; like
  gladys-eufy, the image is written to the logs as a `data:` URL the user
  pastes into a browser. A dashboard widget showing it was considered: too
  heavy for a rare event.
- **Codes and answers** are only sent when newly typed (a value left in the
  form is spent) and the field is emptied with `setConfig`; a refused code
  asks eufy for a new one.
- **Gladys mapping** (core master 2026-10-16, `VACUUM_CLEANER_*`, Matter
  RVC): state ← activity + charge (docked + charging = CHARGING); run-mode
  offers Idle ("Pause") and Cleaning only (`supported_options`, Gladys
  ≥ 5.2.0): Cleaning starts, or resumes a paused job; Idle pauses (no
  confirmed stop). clean-mode Auto = vacuum and mop, Vacuum, Mop, only on
  robots reporting a clean type with a mop; `sweepThenMop` reads as Auto.
  Suction is a `text`/`select` (the eufy levels are not a generic value set).
  Consumables: `maintenance`/`life-remaining` from hours of use and
  jeppesens' X-series lifetimes. Error: text + numeric code (`unknown`).
- **Real time, no polling**: robots only report over MQTT (their cloud record
  holds none of their state); the SDK's read-through cache is set to 10 min
  so reading the live getters every 60 s costs no request.
- **Events**: a job starts at cleaning/paused, ends at docked/idle; an error
  during the job cancels "finished" unless the robot resumes; a new non-zero
  code fires "robot error" (a warning such as "dust bin full" while cleaning
  too). Mid-job recharges are not told apart (see "To check").
