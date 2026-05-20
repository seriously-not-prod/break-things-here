#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/docs/database"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/festival_planner}"

mkdir -p "$OUTPUT_DIR"

command -v psql >/dev/null 2>&1 || {
  echo "psql is required but not installed." >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required but not installed." >&2
  exit 1
}

if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "select 1" >/dev/null; then
  echo "Cannot connect to database via DATABASE_URL=$DATABASE_URL" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -F $'\t' -A -t <<'SQL' > "$TMP_DIR/tables.tsv"
SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'disabled' END AS rls_status,
  COALESCE(NULLIF(regexp_replace(obj_description(c.oid), E'[\n\r]+', ' ', 'g'), ''),
    'Stores ' || replace(c.relname, '_', ' ') || ' records for festival planner workflows.') AS purpose
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -F $'\t' -A -t <<'SQL' > "$TMP_DIR/columns.tsv"
SELECT
  cols.table_name,
  cols.column_name,
  cols.data_type,
  CASE WHEN cols.is_nullable = 'NO' THEN 'NOT NULL' ELSE 'NULLABLE' END AS nullability,
  COALESCE(regexp_replace(cols.column_default, E'[\n\r]+', ' ', 'g'), '-') AS default_value
FROM information_schema.columns cols
WHERE cols.table_schema = 'public'
ORDER BY cols.table_name, cols.ordinal_position;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -F $'\t' -A -t <<'SQL' > "$TMP_DIR/pks.tsv"
SELECT
  tc.table_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS primary_key
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
GROUP BY tc.table_name
ORDER BY tc.table_name;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -F $'\t' -A -t <<'SQL' > "$TMP_DIR/indexes.tsv"
SELECT
  schemaname,
  tablename,
  indexname,
  regexp_replace(indexdef, E'[\n\r]+', ' ', 'g')
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -F $'\t' -A -t <<'SQL' > "$TMP_DIR/fks.tsv"
SELECT
  src.relname AS source_table,
  tgt.relname AS target_table,
  con.conname AS constraint_name
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
WHERE con.contype = 'f'
  AND src_ns.nspname = 'public'
  AND tgt_ns.nspname = 'public'
ORDER BY source_table, target_table, constraint_name;
SQL

python3 - "$TMP_DIR" "$OUTPUT_DIR" <<'PY'
import math
import pathlib
import xml.sax.saxutils as xml_escape
import sys


def read_tsv(path: pathlib.Path, columns: int):
    rows = []
    if not path.exists():
        return rows
    for raw in path.read_text(encoding="utf-8").splitlines():
        parts = raw.split("\t")
        if len(parts) < columns:
            parts += [""] * (columns - len(parts))
        rows.append(parts[:columns])
    return rows


tmp_dir = pathlib.Path(sys.argv[1])
out_dir = pathlib.Path(sys.argv[2])

all_tables = read_tsv(tmp_dir / "tables.tsv", 3)
all_columns = read_tsv(tmp_dir / "columns.tsv", 5)
all_pks = read_tsv(tmp_dir / "pks.tsv", 2)
all_indexes = read_tsv(tmp_dir / "indexes.tsv", 4)
all_fks = read_tsv(tmp_dir / "fks.tsv", 3)

purpose_by_table = {name: purpose for name, _, purpose in all_tables}
rls_by_table = {name: rls for name, rls, _ in all_tables}

columns_by_table = {}
for table, column, dtype, nullability, default_value in all_columns:
    columns_by_table.setdefault(table, []).append((column, dtype, nullability, default_value))

pk_by_table = {table: pk for table, pk in all_pks}

indexes_by_table = {}
for _, table, index_name, index_def in all_indexes:
    indexes_by_table.setdefault(table, []).append((index_name, index_def))

fks = [(source, target, name) for source, target, name in all_fks]
tables = sorted([name for name in purpose_by_table.keys()])

schema_lines = []
schema_lines.append("# Database Schema Reference")
schema_lines.append("")
schema_lines.append("> Generated from live database metadata using `scripts/generate-erd.sh`.")
schema_lines.append("")
schema_lines.append("## Summary")
schema_lines.append("")
schema_lines.append(f"- Schema: `public`")
schema_lines.append(f"- Total tables: `{len(tables)}`")
schema_lines.append("")

for table in tables:
    schema_lines.append(f"## `{table}`")
    schema_lines.append("")
    schema_lines.append(f"- Purpose: {purpose_by_table.get(table, 'N/A')}")
    schema_lines.append(f"- Primary key: `{pk_by_table.get(table, 'None')}`")
    schema_lines.append(f"- RLS: `{rls_by_table.get(table, 'unknown')}`")
    schema_lines.append("")
    schema_lines.append("### Columns")
    schema_lines.append("")
    schema_lines.append("| Column | Type | Nullability | Default |")
    schema_lines.append("| --- | --- | --- | --- |")
    for col, dtype, nullability, default_value in columns_by_table.get(table, []):
        schema_lines.append(
            f"| `{col}` | `{dtype}` | `{nullability}` | `{default_value.replace('|', '\\|')}` |"
        )
    if not columns_by_table.get(table):
        schema_lines.append("| - | - | - | - |")
    schema_lines.append("")
    schema_lines.append("### Indexes")
    schema_lines.append("")
    table_indexes = indexes_by_table.get(table, [])
    if table_indexes:
        for index_name, index_def in table_indexes:
            schema_lines.append(f"- `{index_name}`: `{index_def}`")
    else:
        schema_lines.append("- None")
    schema_lines.append("")

(out_dir / "schema.md").write_text("\n".join(schema_lines) + "\n", encoding="utf-8")

cols = max(1, math.ceil(math.sqrt(max(1, len(tables)))))
node_w = 250
node_h = 46
x_gap = 60
y_gap = 70
margin = 40

positions = {}
for idx, table in enumerate(tables):
    row = idx // cols
    col = idx % cols
    x = margin + col * (node_w + x_gap)
    y = margin + row * (node_h + y_gap)
    positions[table] = (x, y)

width = margin * 2 + cols * node_w + max(0, cols - 1) * x_gap
rows = max(1, math.ceil(len(tables) / cols))
height = margin * 2 + rows * node_h + max(0, rows - 1) * y_gap

svg = []
svg.append('<?xml version="1.0" encoding="UTF-8"?>')
svg.append(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Public schema entity relationship diagram">'
)
svg.append("<defs>")
svg.append("  <marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\">")
svg.append("    <path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#64748b\" />")
svg.append("  </marker>")
svg.append("</defs>")
svg.append(f'<rect x="0" y="0" width="{width}" height="{height}" fill="#f8fafc" />')

for source, target, _ in fks:
    if source not in positions or target not in positions:
        continue
    sx, sy = positions[source]
    tx, ty = positions[target]
    x1 = sx + node_w / 2
    y1 = sy + node_h
    x2 = tx + node_w / 2
    y2 = ty
    svg.append(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#arrow)" />'
    )

for table in tables:
    x, y = positions[table]
    esc_name = xml_escape.escape(table)
    svg.append(
        f'<rect x="{x}" y="{y}" width="{node_w}" height="{node_h}" rx="8" ry="8" fill="#ffffff" stroke="#0f172a" stroke-width="1.2" />'
    )
    svg.append(
        f'<text x="{x + 14}" y="{y + 28}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#0f172a">{esc_name}</text>'
    )

svg.append("</svg>")
(out_dir / "erd.svg").write_text("\n".join(svg) + "\n", encoding="utf-8")
PY

echo "Generated $OUTPUT_DIR/schema.md and $OUTPUT_DIR/erd.svg from live schema."