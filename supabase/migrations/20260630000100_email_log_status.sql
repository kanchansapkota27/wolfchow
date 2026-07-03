-- Add status and failure_reason to email_log so failed send attempts are visible.
-- Previously only successful sends were recorded; failures were silently dropped.
ALTER TABLE email_log
  ADD COLUMN status text NOT NULL DEFAULT 'sent',       -- sent | failed
  ADD COLUMN failure_reason text;                        -- null on success, error message on failure

-- Allow smtp_source to be null for failures where no config was resolved
ALTER TABLE email_log
  ALTER COLUMN smtp_source DROP NOT NULL;
