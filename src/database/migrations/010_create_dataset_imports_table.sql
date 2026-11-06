-- 010_create_dataset_imports_table.sql
-- Dataset imports table for bulk hazard ingestion and tracking

CREATE TABLE IF NOT EXISTS dataset_imports (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, VALIDATED, IMPORTED, FAILED
  error_summary JSONB DEFAULT '[]',
  raw_preview JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dataset_imports_status ON dataset_imports(status);
CREATE INDEX IF NOT EXISTS idx_dataset_imports_created_at ON dataset_imports(created_at);
