// -----------------------------------------------------------------------------
// Note
//
//   This file defines all of the tables Drizzle uses to interact with your
//   D1 database. Until now there has only been a dummy table used for
//   demonstration purposes. To support your Deep Diggers game we'll need to
//   persist session state. Add additional tables here to shape your data model.
//
//   Feel free to extend your schema going forward. Once modified run
//   `pnpm drizzle-kit generate` and `pnpm wrangler d1 migrations apply DB --local`
//   to keep your database schema in sync with your schema definitions.
//
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const dummyTable = sqliteTable('dummy', {
    id: text('id').primaryKey(),
    description: text('description').notNull(),
});
// The `sessions` table holds data for active game sessions. Each session is
// identified by a unique code (your lobby code), holds a JSON blob of state,
// stores the random seed used for procedural generation, and an optional
// timestamp field for future extensions. Feel free to expand this schema as
// needed when adding more features. Data consistency is ensured by Drizzle and
// the underlying D1 engine.
export const sessionsTable = sqliteTable('sessions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    seed: text('seed').notNull(),
    state: text('state').notNull(),
});
