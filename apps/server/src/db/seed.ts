import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { db, schema } from './index.js';

/**
 * Idempotent bootstrap: ensure one org and one admin user exist.
 * Run with `npm run db:seed` after `npm run db:push`.
 */
async function seed(): Promise<void> {
  let org = await db.query.orgs.findFirst({ where: eq(schema.orgs.name, config.orgName) });
  if (!org) {
    [org] = await db.insert(schema.orgs).values({ name: config.orgName }).returning();
    console.log(`Created org "${org.name}" (${org.id})`);
  }

  const email = config.adminEmail.toLowerCase();
  const passwordHash = await hashPassword(config.adminPassword);
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });

  if (existing) {
    await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, existing.id));
    console.log(`Updated admin password for ${email}`);
  } else {
    await db.insert(schema.users).values({ orgId: org.id, email, passwordHash, role: 'admin' });
    console.log(`Created admin ${email}`);
  }

  console.log('\nSeed complete. Log in with:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${config.adminPassword}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
