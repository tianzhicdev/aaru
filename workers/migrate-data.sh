#!/bin/bash
set -euo pipefail

# Supabase source
SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA4OTc2MiwiZXhwIjoyMDg4NjY1NzYyfQ.rFGaaqTfUXMwFO5nJiyIHK5PtaImNdc2uSPqsDQVxdA"
SB_URL="https://uuggqsywcpqmbqzwxdga.supabase.co/rest/v1"

# Neon target
NEON_URL="postgresql://neondb_owner:npg_zHmM6ey1spZu@ep-raspy-shape-a4nx8old-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"

TMPDIR=$(mktemp -d)
echo "Temp dir: $TMPDIR"

fetch_table() {
  local table=$1
  curl -s "$SB_URL/$table?select=*&order=created_at.asc" \
    -H "apikey: $SB_KEY" \
    -H "Authorization: Bearer $SB_KEY" > "$TMPDIR/$table.json"
  echo "Fetched $table: $(python3 -c "import json; print(len(json.load(open('$TMPDIR/$table.json'))))" 2>/dev/null) rows"
}

# Fetch all tables
for t in users device_sessions soul_sessions soul_messages visible_soul_files hidden_soul_files; do
  fetch_table "$t"
done

# Generate SQL insert statements
python3 - "$TMPDIR" <<'PYEOF'
import json, sys, os

tmpdir = sys.argv[1]

def escape_sql(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, (dict, list)):
        return "'" + json.dumps(val).replace("'", "''") + "'::jsonb"
    return "'" + str(val).replace("'", "''") + "'"

def gen_inserts(table, rows):
    if not rows:
        return ""
    cols = list(rows[0].keys())
    lines = []
    for row in rows:
        vals = ", ".join(escape_sql(row.get(c)) for c in cols)
        lines.append(f"({vals})")
    col_list = ", ".join(cols)
    values = ",\n".join(lines)
    return f"INSERT INTO {table} ({col_list}) VALUES\n{values}\nON CONFLICT DO NOTHING;\n\n"

sql = "-- Auto-generated data migration\nBEGIN;\n\n"

# Order matters for FK constraints
for table in ["users", "device_sessions", "soul_sessions", "soul_messages", "visible_soul_files", "hidden_soul_files"]:
    path = os.path.join(tmpdir, f"{table}.json")
    with open(path) as f:
        rows = json.load(f)
    sql += gen_inserts(table, rows)

sql += "COMMIT;\n"

outpath = os.path.join(tmpdir, "migration.sql")
with open(outpath, "w") as f:
    f.write(sql)
print(f"Generated: {outpath}")
PYEOF

echo ""
echo "Running migration SQL against Neon..."
psql "$NEON_URL" -f "$TMPDIR/migration.sql"

echo ""
echo "Verifying row counts..."
for t in users device_sessions soul_sessions soul_messages visible_soul_files hidden_soul_files; do
  count=$(psql "$NEON_URL" -t -c "SELECT count(*) FROM $t" 2>/dev/null | tr -d ' ')
  echo "  $t: $count"
done

rm -rf "$TMPDIR"
echo "Done!"
