import type { PGlite } from "@electric-sql/pglite";

export async function runPgliteMigrations(client: PGlite): Promise<void> {
  // Additive migrations for existing databases — safe to run multiple times.
  await client.exec(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sams_membership_id TEXT NOT NULL DEFAULT '';
  `).catch(() => { /* table may not exist yet — CREATE below will include it */ });

  await client.exec(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_price INTEGER;
  `).catch(() => { /* table may not exist yet — CREATE below will include it */ });

  await client.exec(`
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_email TEXT;
  `).catch(() => { /* table may not exist yet — CREATE below will include it */ });

  await client.exec(`
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_access_token TEXT;
  `).catch(() => { /* table may not exist yet — CREATE below will include it */ });

  await client.exec(`
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
  `).catch(() => { /* table may not exist yet — CREATE below will include it */ });

  await client.exec(`
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_token_expiry TEXT;
  `).catch(() => { /* table may not exist yet — CREATE below will include it */ });

  await client.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      ship_first_name TEXT NOT NULL DEFAULT '',
      ship_last_name TEXT NOT NULL DEFAULT '',
      ship_address1 TEXT NOT NULL DEFAULT '',
      ship_address2 TEXT NOT NULL DEFAULT '',
      ship_city TEXT NOT NULL DEFAULT '',
      ship_state TEXT NOT NULL DEFAULT '',
      ship_zip TEXT NOT NULL DEFAULT '',
      ship_country TEXT NOT NULL DEFAULT 'US',
      bill_same_as_ship BOOLEAN NOT NULL DEFAULT TRUE,
      bill_first_name TEXT NOT NULL DEFAULT '',
      bill_last_name TEXT NOT NULL DEFAULT '',
      bill_address1 TEXT NOT NULL DEFAULT '',
      bill_address2 TEXT NOT NULL DEFAULT '',
      bill_city TEXT NOT NULL DEFAULT '',
      bill_state TEXT NOT NULL DEFAULT '',
      bill_zip TEXT NOT NULL DEFAULT '',
      bill_country TEXT NOT NULL DEFAULT 'US',
      address_jig_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      costco_membership_id TEXT NOT NULL DEFAULT '',
      sams_membership_id TEXT NOT NULL DEFAULT '',
      imap_host TEXT NOT NULL DEFAULT '',
      imap_port TEXT NOT NULL DEFAULT '993',
      imap_user TEXT NOT NULL DEFAULT '',
      imap_password TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credit_cards (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER NOT NULL,
      card_nickname TEXT NOT NULL DEFAULT '',
      cardholder_name TEXT NOT NULL,
      encrypted_number TEXT NOT NULL,
      encrypted_cvv TEXT NOT NULL,
      expiry_month TEXT NOT NULL,
      expiry_year TEXT NOT NULL,
      last_four TEXT NOT NULL DEFAULT '',
      card_type TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS proxies (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL,
      port TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_test_status TEXT NOT NULL DEFAULT 'untested',
      last_test_latency TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      retailer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      group_id INTEGER,
      profile_id INTEGER,
      proxy_id INTEGER,
      retailer TEXT NOT NULL,
      product_url TEXT NOT NULL DEFAULT '',
      product_keywords TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      monitor_delay INTEGER NOT NULL DEFAULT 3000,
      retry_count INTEGER NOT NULL DEFAULT 3,
      max_price INTEGER,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS checkout_results (
      id SERIAL PRIMARY KEY,
      task_id INTEGER,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      product_name TEXT NOT NULL DEFAULT '',
      product_image TEXT NOT NULL DEFAULT '',
      price NUMERIC(10, 2),
      retailer TEXT NOT NULL DEFAULT '',
      order_number TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      profile_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      concurrency INTEGER NOT NULL DEFAULT 5,
      monitor_delay INTEGER NOT NULL DEFAULT 3000,
      webhook_url TEXT NOT NULL DEFAULT '',
      imap_host TEXT NOT NULL DEFAULT '',
      imap_port TEXT NOT NULL DEFAULT '993',
      imap_email TEXT NOT NULL DEFAULT '',
      imap_password TEXT NOT NULL DEFAULT '',
      google_email TEXT,
      google_access_token TEXT,
      google_refresh_token TEXT,
      google_token_expiry TEXT
    );
  `);
}
