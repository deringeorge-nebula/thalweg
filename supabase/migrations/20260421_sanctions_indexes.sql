-- ============================================================
-- Sanctions table — performance indexes for cross-reference
-- Run once in Supabase SQL editor or as a migration.
-- ============================================================

-- Fast look-up when flagging vessels.sanctions_match by MMSI
CREATE INDEX IF NOT EXISTS idx_sanctions_mmsi
  ON sanctions (mmsi)
  WHERE mmsi IS NOT NULL;

-- Fast look-up when flagging vessels.sanctions_match by IMO number
CREATE INDEX IF NOT EXISTS idx_sanctions_imo_number
  ON sanctions (imo_number)
  WHERE imo_number IS NOT NULL;

-- Unique constraint used by the upsert conflict key
-- (add only if not already declared on the table)
-- ALTER TABLE sanctions ADD CONSTRAINT sanctions_opensanctions_id_key
--   UNIQUE (opensanctions_id);

-- Optional: composite index for the sanctioned_vessels conflict pair
CREATE INDEX IF NOT EXISTS idx_sanctioned_vessels_mmsi_imo
  ON sanctioned_vessels (mmsi, imo_number);
