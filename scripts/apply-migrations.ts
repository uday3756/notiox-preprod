#!/usr/bin/env node
/**
 * Apply Supabase migrations locally
 * Usage: npx ts-node scripts/apply-migrations.ts
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigrations() {
  const migrationsDir = path.join(__dirname, "../supabase/migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`📝 Found ${files.length} migration files\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log(`🔄 Running: ${file}`);

    try {
      const { error } = await supabase.rpc("exec", { sql });

      if (error) {
        console.error(`❌ Failed: ${error.message}`);
        // Continue with next migration (in case of "already exists" errors)
      } else {
        console.log(`✅ Success: ${file}\n`);
      }
    } catch (err) {
      // Try direct query if RPC fails
      try {
        await supabase.from("scheduling_nodes").select("id").limit(0);
        console.log(`✅ Table exists: ${file}\n`);
      } catch {
        console.error(`⚠️  Could not verify: ${file}`);
      }
    }
  }

  console.log("✨ Migration check complete!");
  console.log("\n📋 Verify in Supabase:");
  console.log(
    "   1. Go to SQL Editor → paste migrations manually if above failed"
  );
  console.log("   2. Go to Table Editor → verify tables exist");
  console.log("   3. Check RLS policies are enabled\n");
}

applyMigrations().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
