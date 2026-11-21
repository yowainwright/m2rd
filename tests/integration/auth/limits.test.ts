import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createUsageCounter, openDatabase } from '@/packages/server/src/auth/utils';

const usageSql = readFileSync(
  new URL('../../../packages/server/usage.sql', import.meta.url),
  'utf8',
);
const authSql = readFileSync(
  new URL('../../../packages/server/schema.sql', import.meta.url),
  'utf8',
);
const firstMinute = Date.UTC(2026, 10, 17, 11, 40);
const nextDay = Date.UTC(2026, 10, 18);
let database: ReturnType<typeof openDatabase>;

beforeEach(() => {
  database = openDatabase(':memory:');
  database.exec(authSql);
  database.exec(`INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES ('a','GitHub account','a@m2rd.invalid',0,0,0),('b','GitHub account','b@m2rd.invalid',0,0,0)`);
  database.exec(usageSql);
});

afterEach(() => {
  database.close();
});

describe('shared account quotas', () => {
  it('admits ten starts per UTC minute and keeps accounts independent', () => {
    const charge = createUsageCounter(database);
    for (let count = 0; count < 10; count += 1) expect(charge('a', firstMinute)).toBeNull();
    expect(charge('a', firstMinute + 59_999)).toBe('minute');
    expect(charge('b', firstMinute)).toBeNull();
    expect(charge('a', firstMinute + 60_000)).toBeNull();
  });

  it('rejects a daily limit atomically and resets at midnight UTC', () => {
    const charge = createUsageCounter(database);
    for (let count = 0; count < 100; count += 1) {
      const minute = Math.floor(count / 10);
      expect(charge('a', firstMinute + minute * 60_000)).toBeNull();
    }
    expect(charge('a', nextDay - 1)).toBe('day');
    const unexpected = database
      .prepare("SELECT count FROM usage WHERE window_type = 'minute' AND window_start = ?")
      .get(nextDay - 60_000);
    expect(unexpected).toBeUndefined();
    expect(charge('a', nextDay)).toBeNull();
  });
});
