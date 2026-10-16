// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, LANGUAGES } from '../src/config.js';
import { ACTIONS, SCENE_TRIGGERS } from '../src/constants.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const handlers = read('src/handlers.js');
const app = read('src/app.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, entry] of node.entries()) {
      yield* texts(entry, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers].flatMap((item) => item.fields ?? []),
];

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.equal(manifest.gladys_version, '>=5.2.0', 'run-mode/clean-mode supported_options');
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-eufy-clean:${manifest.version}`);
  assert.equal(manifest.version, pkg.version);
  assert.match(manifest.cover_image, /^https:\/\/raw\.githubusercontent\.com\/LM1LC3N7\//);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    const docs = read(`docs/${lang}.md`);
    assert.ok(docs.length >= 300, `docs/${lang}.md is too short for the store`);
    assert.match(docs, /not\s+affiliated\s+with\s+Anker|sans\s+lien\s+avec\s+Anker/i);
    assert.match(docs, /eufy Security/, `docs/${lang}.md says what is out of scope`);
  }
});

test('the package: Node 24.5+ (the eufy SDK needs it), pinned eufy SDK', () => {
  assert.equal(pkg.engines.node, '>=24.5');
  assert.match(
    pkg.dependencies['@mega-yfue/eufy-sdk'],
    /^\d+\.\d+\.\d+(-[\w.]+)?$/,
    'exact version',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /node-version: \[24\]/, 'the CI runs the Node the SDK supports');
});

test('every text is in English and French', () => {
  for (const [path, text] of texts(manifest)) {
    for (const lang of ['en', 'fr']) {
      assert.ok(text[lang]?.trim(), `${path} needs ${lang}`);
    }
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.ok(fields[key], `${key} is not in the config_schema`);
    assert.deepEqual(fields[key].default, value, key);
  }
  assert.deepEqual(
    fields.language.options.map((o) => o.value),
    LANGUAGES,
  );
  assert.equal(fields.email.type, 'string');
  assert.equal(fields.password.type, 'secret', 'the password is never sent back to the browser');
  assert.equal(fields.email.required && fields.password.required, true);
  assert.equal(fields.verification_code.required, false);
  assert.equal(fields.captcha_answer.required, false);
  for (const key of ['intro', 'sign_in']) {
    const section = fields[key];
    assert.equal(section.type, 'section');
    assert.equal(section.required ?? section.default ?? section.placeholder, undefined);
    for (const lang of ['en', 'fr']) {
      const length = section.description[lang].length;
      assert.ok(length <= 1000, `${key}.${lang}: ${length} characters`);
    }
    assert.ok((section.links ?? []).every((l) => l.url.startsWith('https://')));
  }
  assert.match(fields.intro.description.en, /eufy Security integration/);
  assert.ok(fields.intro.links.length <= 5);
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `${field.key}: placeholder`);
  }
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `${field.key}: source and options together`);
    assert.equal(field.default, undefined, `${field.key}: no default on a dynamic select`);
  }
  for (const field of manifest.config_schema) {
    assert.match(field.key, /^[a-z0-9_]+$/);
  }
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(handlers.includes(`onAction(ACTIONS.${name}`), `ACTIONS.${name} has no handler`);
  }
  for (const action of manifest.actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120);
  }
  assert.ok(handlers.includes('onSetValue'), 'the commands go through onSetValue');
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.equal(manifest.scene_actions, undefined);
});

test('the trigger fields and variables are what the events carry', () => {
  // The data objects of pushSceneEvent in src/app.js: finished, error.
  const sent = [...app.matchAll(/pushSceneEvent\(SCENE_TRIGGERS\.(\w+), \{([\s\S]*?)\}\);/g)];
  const byKey = Object.fromEntries(sent.map((m) => [SCENE_TRIGGERS[m[1]], m[2]]));
  const expected = {
    [SCENE_TRIGGERS.CLEANING_FINISHED]: ['robot', 'robot_name', 'duration', 'area'],
    [SCENE_TRIGGERS.ROBOT_ERROR]: ['robot', 'robot_name', 'error_code', 'error_message'],
  };
  for (const trigger of manifest.scene_triggers) {
    const declared = [...trigger.fields, ...trigger.variables].map((f) => f.key);
    assert.deepEqual(declared, expected[trigger.key], trigger.key);
    for (const key of declared) {
      assert.match(byKey[trigger.key], new RegExp(`\\b${key}[:,]`), `${trigger.key}: ${key}`);
    }
  }
});
