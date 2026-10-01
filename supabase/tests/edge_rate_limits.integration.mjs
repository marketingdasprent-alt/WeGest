import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.WEGEST_PGLITE_MODULE;
if (!modulePath)
  throw new Error('Set WEGEST_PGLITE_MODULE to a temporary @electric-sql/pglite module.');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const migration = new URL(
  '../migrations/20260925120232_edge_rate_limits_atomicos.sql',
  import.meta.url
);
const subject = 'a'.repeat(64);
const consume = async (operation = 'register-org', hash = subject, limit = 5, seconds = 3600) => {
  const { rows } = await db.query('select public.consume_edge_rate_limit($1,$2,$3,$4) as result', [
    operation,
    hash,
    limit,
    seconds,
  ]);
  return rows[0].result;
};
let checks = 0;
const check = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(migration, 'utf8'));
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(consume(), (error) => error.code === '42501');
    checks++;
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await assert.rejects(
    db.query('select * from private.edge_rate_limits'),
    (error) => error.code === '42501'
  );
  checks++;
  for (let attempt = 0; attempt < 5; attempt++) check((await consume()).allowed, true);
  const denied = await consume();
  check(denied.allowed, false);
  check(denied.retry_after > 0 && denied.retry_after <= 3600, true);
  check((await consume('contact-inquiry-origin')).allowed, true);
  check((await consume('register-org', 'b'.repeat(64))).allowed, true);
  for (const args of [
    ['bad operation', subject, 5, 60],
    ['valid', 'raw-ip', 5, 60],
    ['valid', subject, 0, 60],
    ['valid', subject, 5, 0],
  ]) {
    await assert.rejects(consume(...args), (error) => error.code === '22023');
    checks++;
  }
  await db.exec('reset role');
  const { rows: stored } = await db.query(
    'select cardinality(request_times) as total from private.edge_rate_limits where operation=$1 and subject_hash=$2',
    ['register-org', subject]
  );
  check(stored[0].total, 5);
  await db.query(
    "update private.edge_rate_limits set request_times = ARRAY[now()-interval '2 hours',now()-interval '30 minutes'], expires_at=now()+interval '1 hour' where operation=$1 and subject_hash=$2",
    ['register-org', subject]
  );
  await db.exec('set role service_role');
  check((await consume('register-org', subject, 2)).allowed, true);
  check((await consume('register-org', subject, 2)).allowed, false);
  await db.exec('reset role');
  await db.query(
    "update private.edge_rate_limits set expires_at=now()-interval '1 second' where operation=$1 and subject_hash=$2",
    ['register-org', subject]
  );
  await db.exec('set role service_role');
  check((await consume('register-org', subject, 2)).allowed, true);
  const burst = await Promise.all(
    Array.from({ length: 50 }, () => consume('burst-test', subject, 5))
  );
  check(burst.filter((result) => result.allowed).length, 5);
  await db.exec('reset role');
  await db.exec(
    "insert into private.edge_rate_limits(operation,subject_hash,shard,request_times,expires_at) select 'capacity-test','00'||lpad(i::text,62,'0'),0,ARRAY[now()],now()+interval '1 hour' from generate_series(1,1024) i"
  );
  await db.exec('set role service_role');
  const newSubject = '00' + 'f'.repeat(62);
  check(await consume('capacity-test', newSubject), {
    allowed: false,
    retry_after: 30,
    unavailable: true,
  });
  check((await consume('capacity-test', '00' + '1'.padStart(62, '0'))).allowed, true);
  // Encher uma operação (ex.: register-org com IPs rodados) não pode deixar as
  // outras sem capacidade — a API Primavera de outra org continuava a 503.
  check((await consume('outra-operacao', newSubject)).allowed, true);
  await db.exec('reset role');
  await db.exec(
    "update private.edge_rate_limits set expires_at=now()-interval '1 second' where operation='capacity-test' and subject_hash='00'||lpad('2',62,'0')"
  );
  await db.exec('set role service_role');
  check((await consume('capacity-test', newSubject)).allowed, true);
  await db.exec('reset role');
  const { rows: count } = await db.query(
    "select count(*)::integer as total from private.edge_rate_limits where shard=0 and operation='capacity-test'"
  );
  check(count[0].total, 1024);
  console.log(
    `PASS ${checks} PostgreSQL checks: grants, quotas, isolation, sliding expiry, capacity, cleanup and 50 queued reservations.`
  );
  console.log(
    'PGlite uses one connection; independent concurrent transactions require a PostgreSQL integration environment.'
  );
} finally {
  await db.close();
}
