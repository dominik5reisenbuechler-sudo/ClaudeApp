#!/usr/bin/env node
/**
 * Check that this project's Supabase configuration actually works.
 *
 * Written because the app's failure mode for a half-configured project is a
 * loading screen: the client waits on a request that never usefully completes,
 * and nothing on screen says which request or why. This asks the same questions
 * the app asks at startup, in order, and stops at the first one that fails.
 *
 * Read-only. It never writes, and it never prints a key.
 *
 *   node scripts/check-supabase.mjs
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUEST_TIMEOUT_MS = 10_000;

/** Tables the app reads before it can render anything at all. */
const STARTUP_TABLES = ['profiles', 'user_preferences', 'user_targets'];

/** Reference data the app is unusable without, with the seed that fills it. */
const SEEDED_TABLES = [
  { table: 'exercises', seed: 'supabase/seed/0002_muscles_and_exercises.sql' },
  { table: 'ingredients', seed: 'supabase/seed/0001_ingredients_and_recipes.sql' },
  { table: 'achievements', seed: 'supabase/seed/0004_achievements.sql' },
];

const bold = (text) => `[1m${text}[0m`;
const red = (text) => `[31m${text}[0m`;
const green = (text) => `[32m${text}[0m`;
const yellow = (text) => `[33m${text}[0m`;

const pass = (message) => console.log(`${green('✓')} ${message}`);
const warn = (message) => console.log(`${yellow('!')} ${message}`);

function fail(message, ...hints) {
  console.log(`${red('✗')} ${message}`);
  for (const hint of hints) console.log(`  ${hint}`);
  console.log(`\n${red(bold('Stopped here.'))} Fix the above, then run this again.`);
  process.exit(1);
}

function readEnvFile() {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    fail(
      'No .env file in this directory.',
      'Run: cp .env.example .env',
      'Then fill in the two EXPO_PUBLIC_SUPABASE_* values from your project.',
    );
  }

  const values = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    values[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return values;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return { response: await fetch(url, { ...options, signal: controller.signal }), error: null };
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError';
    return {
      response: null,
      error: timedOut ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s` : String(cause?.message ?? cause),
    };
  } finally {
    clearTimeout(timer);
  }
}

console.log(bold('\nChecking your Supabase configuration\n'));

// --------------------------------------------------------------------------
// 1. The values themselves
// --------------------------------------------------------------------------

const env = readEnvFile();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url) fail('EXPO_PUBLIC_SUPABASE_URL is missing from .env.');
if (!key) fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from .env.');

let parsed;
try {
  parsed = new URL(url);
} catch {
  fail(
    `EXPO_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`,
    'It should look like https://abcdefghijkl.supabase.co — no trailing slash, no /dashboard path.',
  );
}

if (parsed.pathname !== '/' && parsed.pathname !== '') {
  warn(
    `The URL has a path on it (${parsed.pathname}). The project URL is usually just the host — a dashboard URL will not work.`,
  );
}

pass(`Project URL: ${parsed.origin}`);

// A service-role key in a client bundle would be a serious mistake, so it is
// worth naming explicitly rather than letting it fail later as a permission
// error nobody connects back to this file.
//
// The role lives in the JWT payload, which is base64 — checking the raw string
// for "service_role" finds nothing and quietly passes a key that should have
// stopped the run. The payload has to actually be decoded.
if (roleClaimOf(key) === 'service_role' || key.startsWith('sb_secret_')) {
  fail(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY is a service-role key.',
    'That key bypasses Row Level Security entirely and must never be in the app bundle.',
    'Use the anon / publishable key from Settings → API.',
    'If this key has been committed or shared anywhere, rotate it in the dashboard.',
  );
}

/** The `role` claim of a Supabase JWT, or null for anything else. */
function roleClaimOf(candidate) {
  const segments = candidate.split('.');
  if (segments.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

const keyShape = key.startsWith('sb_publishable_')
  ? 'publishable key'
  : key.startsWith('eyJ')
    ? 'legacy anon JWT'
    : 'unrecognised format';

if (keyShape === 'unrecognised format') {
  warn(
    `The anon key is in an unrecognised format. Expected either sb_publishable_… or a JWT starting eyJ… — check you copied the whole value.`,
  );
} else {
  pass(`Anon key: ${keyShape}, ${key.length} characters`);
}

// --------------------------------------------------------------------------
// 2. Can we reach the project at all?
// --------------------------------------------------------------------------

const health = await request(`${parsed.origin}/auth/v1/health`, { headers: { apikey: key } });

if (health.error) {
  fail(
    `Could not reach ${parsed.host}: ${health.error}`,
    'Either the URL is wrong, the project is paused, or this machine cannot reach it.',
    'A paused project is the common one — free projects pause after inactivity and resume from the dashboard.',
  );
}

if (health.response.status === 401) {
  fail(
    'The project is reachable but rejected the anon key (401).',
    'Copy EXPO_PUBLIC_SUPABASE_ANON_KEY again from Settings → API, and make sure it belongs to this project.',
  );
}

if (!health.response.ok) {
  fail(`Auth service answered ${health.response.status} ${health.response.statusText}.`);
}

pass('Auth service is reachable and accepted the key');

// --------------------------------------------------------------------------
// 3. Have the migrations been applied?
// --------------------------------------------------------------------------

const missing = [];

for (const table of STARTUP_TABLES) {
  const probe = await request(
    `${parsed.origin}/rest/v1/${table}?select=*&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );

  if (probe.error) fail(`Could not query "${table}": ${probe.error}`);

  // 200 = exists and readable. 401/403 = exists, RLS denying an anonymous
  // caller, which is exactly right for a user-scoped table. 404 = not there.
  if (probe.response.status === 404) missing.push(table);
}

if (missing.length > 0) {
  fail(
    `These tables do not exist: ${missing.join(', ')}`,
    'The migrations have not been applied to this project.',
    'Run every file in supabase/migrations/ in filename order (supabase db push, or paste each into the SQL editor).',
    'This is the single most common reason the app sits on its loading screen.',
  );
}

pass(`Startup tables exist (${STARTUP_TABLES.join(', ')})`);

// --------------------------------------------------------------------------
// 4. Have the seeds been loaded?
// --------------------------------------------------------------------------

let seedProblems = 0;

for (const { table, seed } of SEEDED_TABLES) {
  const probe = await request(`${parsed.origin}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });

  if (probe.error || !probe.response) {
    warn(`Could not count "${table}".`);
    seedProblems += 1;
    continue;
  }

  if (probe.response.status === 404) {
    warn(`Table "${table}" does not exist — load ${seed}`);
    seedProblems += 1;
    continue;
  }

  const count = Number(probe.response.headers.get('content-range')?.split('/')[1] ?? '0');

  if (count === 0) {
    warn(`Table "${table}" is empty — load ${seed}`);
    seedProblems += 1;
  } else {
    pass(`${table}: ${count} rows`);
  }
}

// --------------------------------------------------------------------------

console.log('');

if (seedProblems > 0) {
  console.log(
    `${yellow(bold('Connection works, reference data is incomplete.'))}\n` +
      'Sign-in will work. Exercise and food screens will be empty until the seeds are loaded.\n',
  );
  process.exit(0);
}

console.log(
  `${green(bold('Everything checks out.'))}\n` +
    'If the app still hangs on its loading screen, restart the dev server — .env is only read at\n' +
    'launch, so a corrected value does nothing until Expo is stopped and started again.\n',
);
