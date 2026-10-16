# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- eufy account (e-mail, password, country), through the eufy cloud of the
  eufy app: the verification code and the captcha answer eufy may ask for are
  typed in the configuration (the captcha image is written in the logs), the
  session is kept across restarts, and the integration signs in with its own
  identity so it does not sign out the eufy app nor the eufy Security
  integration. A refused sign-in waits for a configuration change; an
  unreachable cloud is retried after 1, 2, 4… up to 15 minutes; a session
  ended by eufy signs in again after the delay eufy asks.
- One device per eufy robot vacuum: state (stopped, running, paused, error,
  returning to dock, charging, docked), clean / pause (resumes a paused
  cleaning), return to dock, cleaning type (vacuum, mop, both) on mop robots,
  suction power (Quiet to Max Pro, as the robot offers), battery, charging,
  error and error code, life remaining of the side brush, rolling brush,
  filter, mop, sensors and cleaning tray, area and time of the last cleaning,
  "Find my robot".
- Real-time updates over eufy's secure MQTT, and an "unreachable" badge when
  eufy reports a robot offline.
- Scene triggers "Cleaning finished" (time and area) and "Robot error" (code
  and message).
- The older robots (G-series, L60, X8…) are read without commands, as the
  eufy SDK does.
- Cameras, doorbells, locks and HomeBases are ignored (eufy Security
  integration).
- "Test the connection" button with each robot's state and battery.
- Feature names, suction levels and error messages in French or English.

[Unreleased]: https://github.com/LM1LC3N7/gladys-eufy-clean/commits/main
