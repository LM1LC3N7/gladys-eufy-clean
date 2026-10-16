import { test } from 'node:test';
import assert from 'node:assert/strict';
import { track } from '../src/events.js';

const T0 = 1_000_000;
const MIN = 60_000;

/** Runs readings through track(), collecting the events. */
function run(readings) {
  let job;
  let previous;
  const events = [];
  for (const [at, reading] of readings) {
    const result = track(previous, reading, job, T0 + at);
    job = result.job;
    previous = reading;
    events.push(...result.events);
  }
  return { job, events };
}

test('a cleaning that ends on the dock fires "finished" once', () => {
  const { events, job } = run([
    [0, { activity: 'docked' }],
    [1 * MIN, { activity: 'cleaning' }],
    [20 * MIN, { activity: 'paused' }],
    [21 * MIN, { activity: 'cleaning' }],
    [40 * MIN, { activity: 'returning', cleanTime: 2280, cleanArea: 51.24 }],
    [41 * MIN, { activity: 'docked', cleanTime: 2280, cleanArea: 51.24 }],
    [42 * MIN, { activity: 'docked', cleanTime: 2280, cleanArea: 51.24 }],
  ]);
  assert.deepEqual(events, [{ type: 'finished', minutes: 38, area: 51.2 }]);
  assert.equal(job, undefined);
});

test("without the robot's counters, the duration is the time elapsed", () => {
  const { events } = run([
    [0, { activity: 'idle' }],
    [1 * MIN, { activity: 'cleaning' }],
    [13 * MIN, { activity: 'idle' }],
  ]);
  assert.deepEqual(events, [{ type: 'finished', minutes: 12, area: null }]);
});

test('the first reading is history; a job already running is followed', () => {
  assert.deepEqual(
    track(undefined, { activity: 'docked', errorCode: 5 }, undefined, T0).events,
    [],
  );
  const { events } = run([
    [0, { activity: 'cleaning', cleanTime: 600 }],
    [5 * MIN, { activity: 'docked', cleanTime: 900 }],
  ]);
  assert.deepEqual(events, [{ type: 'finished', minutes: 15, area: null }]);
});

test('an error fires once per new code; a job stopped on an error does not "finish"', () => {
  const { events } = run([
    [0, { activity: 'docked', errorCode: 0 }],
    [1 * MIN, { activity: 'cleaning', errorCode: 0 }],
    [2 * MIN, { activity: 'error', errorCode: 2 }],
    [3 * MIN, { activity: 'error', errorCode: 2 }],
    [4 * MIN, { activity: 'error', errorCode: 4 }],
    [5 * MIN, { activity: 'docked', errorCode: 0 }],
  ]);
  assert.deepEqual(events, [
    { type: 'error', code: 2 },
    { type: 'error', code: 4 },
  ]);
});

test('an error cleared and the job resumed: it finishes normally', () => {
  const { events } = run([
    [0, { activity: 'docked' }],
    [1 * MIN, { activity: 'cleaning' }],
    [2 * MIN, { activity: 'error', errorCode: 7 }],
    [3 * MIN, { activity: 'cleaning', errorCode: 0 }],
    [9 * MIN, { activity: 'docked' }],
  ]);
  assert.deepEqual(events, [
    { type: 'error', code: 7 },
    { type: 'finished', minutes: 8, area: null },
  ]);
});

test('a warning during a clean (dust bin full) does not cancel the "finished"', () => {
  const { events } = run([
    [0, { activity: 'docked' }],
    [1 * MIN, { activity: 'cleaning', errorCode: 0 }],
    [5 * MIN, { activity: 'cleaning', errorCode: 2311 }],
    [9 * MIN, { activity: 'docked', errorCode: 2311 }],
  ]);
  assert.deepEqual(events, [
    { type: 'error', code: 2311 },
    { type: 'finished', minutes: 8, area: null },
  ]);
});

test('going home without a job fires nothing', () => {
  const { events } = run([
    [0, { activity: 'idle' }],
    [1 * MIN, { activity: 'returning' }],
    [2 * MIN, { activity: 'docked' }],
  ]);
  assert.deepEqual(events, []);
});
