# gladys-eufy-clean

[Gladys Assistant](https://gladysassistant.com) external integration for
**eufy robot vacuums** (RoboVac, eufy Clean X, L, G, C series), through the
eufy cloud (the one of the eufy app): state, battery and charging, clean /
pause, return to dock, cleaning type, suction power, life remaining of the
brushes, filter, mop, sensors and cleaning tray, error and error code, area
and time of the last cleaning, "find my robot", and scene triggers when a
cleaning ends or an error appears. Real time over eufy's secure MQTT.
Unofficial, not affiliated with Anker or eufy.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> **Version 0.1.** Tested with simulated robots shaped after the eufy SDK, not
> yet with a real robot or account. Feedback and bug reports are welcome in the
> [GitHub issues](https://github.com/LM1LC3N7/gladys-eufy-clean/issues).

**Scope**: robot vacuums only. eufy cameras, doorbells, locks, sensors and
HomeBases are covered by the eufy Security integration
([cicoub13/gladys-eufy](https://github.com/cicoub13/gladys-eufy)): this one
ignores them and opens no connection to them. Robot mowers come later
([TODO.md](TODO.md)).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (EufyCleanApp) ⇄ src/eufy.js ⇄ @mega-yfue/eufy-sdk ⇄ eufy cloud (HTTPS + secure MQTT)
                                 ├─ src/robot.js      the SDK's Device objects -> plain readings (pure)
                                 ├─ src/devices.js    readings -> Gladys devices and states (pure)
                                 ├─ src/events.js     two readings -> scene events (pure)
                                 ├─ src/publisher.js  300 states/min, scene events queued
                                 └─ src/store.js      account and features seen (/data)
```

- **Account**: e-mail, password (`secret` field) and country of a eufy
  account. `@mega-yfue/eufy-sdk` signs in (`login` → ok, captcha or 2FA): the
  verification code and the captcha answer are typed in two configuration
  fields, sent once and emptied; the captcha image is logged as a `data:` URL,
  since the configuration screen cannot show an image. The session (token,
  ECDH key, install identity) is kept in `/data/eufy-session.json`.
- **Own install identity** (`openudid`): derived from the e-mail and this
  integration's name, so its session never displaces the eufy Security
  integration's (the SDK's default identity depends on the e-mail only).
- **Robots only**: the SDK's realtime bring-up also registers an FCM push
  token and opens P2P sessions to wired HomeBases and cameras; `RobotOnlyEufy`
  switches both off (`src/eufy.js`), so only the secure MQTT channel of the
  robots and the SDK's device-list poll (10 min) remain.
- **Reading**: robots report over MQTT; each `propertyChanged` /
  `deviceState` / `availability` event schedules a read (2 s later) of the
  robot's live state through the SDK's typed getters (`vacuumClean()`,
  `suction()`), plus a 60 s refresh without any request.
- **Devices**: `ext:<selector>:robot:<serial>`, features following what the
  robot reports or the SDK confirms (`rolesOf`), kept across restarts.
  `vacuum-cleaner` state / run-mode / clean-mode / dock like the core's
  Matter robot vacuums, `maintenance`/`life-remaining` consumables,
  `text`/`select` suction power.
- **Commands**: the SDK's confirmed writes only (`startCleaning`,
  `pauseCleaning`, `resumeCleaning`, `returnToDock`, `setCleanParam`,
  `setSuctionLevel`, `locate`). The older (`eufy_home_tuya`) robots are read
  only, as in the SDK.
- **Scene events**: `cleaning_finished` (a job back on the dock or stopped,
  not after an error) and `robot_error` (a new non-zero fault code), never on
  the first reading.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

Node 24.5 or later (the eufy SDK needs it). `test/fixtures/robots.js` holds
robots shaped after the SDK's declarations; `test/helpers/fakeEufy.js` is a
fake eufy cloud behind the client factory (sign-in with code and captcha,
devices, MQTT reports); Gladys is the SDK's `createFakeGladys`.
`test/eufy.test.js` checks the names the integration relies on against the
installed eufy SDK, without network.

## Credits

- [@mega-yfue/eufy-sdk](https://github.com/mega-yfue/eufy-sdk) (Apache-2.0,
  max246, lenoxys, martijnpoppen and contributors): the eufy cloud client used
  as a dependency, as is — sign-in, session, device list, secure MQTT, the
  robot vacuum reads and writes. The choice is explained in
  [TODO.md](TODO.md), Decisions.
- [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean) (MIT), the
  Home Assistant integration: the meaning of the fault codes and the lifetimes
  of the consumables (data, reworded).
- [cicoub13/gladys-eufy](https://github.com/cicoub13/gladys-eufy): how a
  Gladys integration hands eufy's captcha and verification code to the user.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic lists the repository in the Gladys store.

## License

Apache-2.0. eufy, Anker, RoboVac and BoostIQ are trademarks of their owner;
this project is not affiliated with Anker or eufy.
