import type Database from 'better-sqlite3';

export interface ServerAuthOptions {
  database: Database.Database;
  apiOrigin: string;
  frontendOrigin: string;
  secret: string;
  githubClientId: string;
  githubClientSecret: string;
  verifierClientId: string;
  verifierClientSecret: string;
}

export type VerifiedAccount = { id: string; sessionId: string };
export type UsageLimit = 'minute' | 'day';
