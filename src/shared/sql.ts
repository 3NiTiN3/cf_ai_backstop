export function addColumnIfMissing(
  sql: SqlStorage,
  table: string,
  column: string,
  definition: string,
): void {
  const exists = sql
    .exec(`PRAGMA table_info(${table})`)
    .toArray()
    .some((row) => row.name === column);
  if (!exists)
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
