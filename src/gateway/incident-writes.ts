import { z } from "zod";

const Owner = z.object({ incident_id: z.string() });

export class IncidentWrites {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS incident_writes (
      write_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL
    )`);
  }

  attach(writeId: string, incidentId: string): boolean {
    return (
      this.sql.exec(
        "INSERT OR IGNORE INTO incident_writes (write_id, incident_id) VALUES (?, ?)",
        writeId,
        incidentId,
      ).rowsWritten > 0
    );
  }

  attachUnowned(writeIds: string[], incidentId: string): number {
    return writeIds.filter((id) => this.attach(id, incidentId)).length;
  }

  ownerOfOldest(writeIds: string[]): string | null {
    const row = this.sql
      .exec(
        `SELECT owned.incident_id FROM json_each(?) AS waiting
          JOIN incident_writes AS owned ON owned.write_id = waiting.value
          ORDER BY waiting.key LIMIT 1`,
        JSON.stringify(writeIds),
      )
      .toArray()[0];
    return row === undefined ? null : Owner.parse(row).incident_id;
  }

  ownerOf(writeId: string): string | null {
    return this.ownerOfOldest([writeId]);
  }

  forgetMissingIncidents(): void {
    this.sql.exec(
      "DELETE FROM incident_writes WHERE incident_id NOT IN (SELECT id FROM incidents)",
    );
  }
}
