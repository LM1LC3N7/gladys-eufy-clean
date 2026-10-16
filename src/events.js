// -----------------------------------------------------------------------------
// Two readings of a robot -> scene events (pure).
//
// - A cleaning job starts when the robot starts cleaning and ends when it is
//   back on its dock or stopped: "cleaning finished", unless the robot stopped
//   on an error on the way (the error trigger said it already).
// - An error fires when the robot reports a new non-zero fault code.
// The first reading after a start is history: it fires nothing, but a job
// already running is followed to its end.
// -----------------------------------------------------------------------------

const BUSY = new Set(['cleaning', 'paused', 'returning']);
const DONE = new Set(['docked', 'idle']);

/**
 * `job`: the job in progress (`{ startedAt, failed }`) or undefined.
 * Returns the job after this reading and the events it fires:
 *   { type: 'finished', minutes, area } | { type: 'error', code }
 */
export function track(previous, current, job, now) {
  const events = [];
  let next = job;
  if (!next && (current.activity === 'cleaning' || current.activity === 'paused')) {
    next = { startedAt: now, failed: false };
  }
  if (next && current.activity === 'error') {
    next = { ...next, failed: true };
  } else if (next?.failed && current.activity === 'cleaning') {
    // Cleared and resumed: the job goes on.
    next = { ...next, failed: false };
  }
  if (!previous) {
    return { job: next, events };
  }

  const code = current.errorCode ?? 0;
  if (code !== 0 && code !== (previous.errorCode ?? 0)) {
    events.push({ type: 'error', code });
  }

  const ended =
    next &&
    DONE.has(current.activity) &&
    (BUSY.has(previous.activity) || previous.activity === 'error');
  if (ended) {
    if (!next.failed) {
      const seconds =
        current.cleanTime !== undefined ? current.cleanTime : (now - next.startedAt) / 1000;
      events.push({
        type: 'finished',
        minutes: Math.max(0, Math.round(seconds / 60)),
        area: current.cleanArea !== undefined ? Math.round(current.cleanArea * 10) / 10 : null,
      });
    }
    next = undefined;
  }
  return { job: next, events };
}
