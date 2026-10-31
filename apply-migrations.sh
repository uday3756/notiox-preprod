#!/bin/bash

# Apply Supabase migrations using the SQL API
# Usage: bash apply-migrations.sh <access_token>

SUPABASE_URL="https://tfklcyinjvpvfyxltbzz.supabase.co"
SUPABASE_TOKEN="$1"

if [ -z "$SUPABASE_TOKEN" ]; then
  echo "❌ Usage: bash apply-migrations.sh <access_token>"
  exit 1
fi

# Array of migration files to apply
MIGRATIONS=(
  "supabase/migrations/20260621020000_scheduling_nodes.sql"
  "supabase/migrations/20260621020100_user_working_hours.sql"
  "supabase/migrations/20260621020300_scheduling_logs.sql"
  "supabase/migrations/20260621020500_reminder_sent.sql"
)

echo "🔄 Applying Supabase Migrations..."
echo ""

for migration_file in "${MIGRATIONS[@]}"; do
  if [ ! -f "$migration_file" ]; then
    echo "❌ File not found: $migration_file"
    continue
  fi

  filename=$(basename "$migration_file")
  echo "📝 Processing: $filename"

  # Read SQL content
  sql_content=$(cat "$migration_file")

  # Apply migration via HTTP
  response=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec" \
    -H "Authorization: Bearer ${SUPABASE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$sql_content" | jq -Rs '.')}")

  if echo "$response" | grep -q "error"; then
    echo "⚠️  Note: $filename (may already exist)"
  else
    echo "✅ Applied: $filename"
  fi
  echo ""
done

echo "✨ Migration process complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Go to Supabase Dashboard → Table Editor"
echo "  2. Verify these tables exist:"
echo "     - scheduling_nodes"
echo "     - user_working_hours"
echo "     - scheduling_logs"
echo "     - reminder_sent"
