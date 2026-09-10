import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function teardown() {
  const database = resolve('tests/auth-e2e/auth.sqlite');
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${database}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
}
