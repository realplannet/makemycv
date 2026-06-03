-- Run this in Supabase Dashboard → SQL Editor

-- 1. Sessions table
create table if not exists cv_sessions (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  file_id     text not null unique,
  name        text,
  pdf_path    text,
  docx_path   text,
  paid        boolean default false,
  created_at  timestamptz default now()
);

-- Index for fast lookup
create index if not exists idx_cv_sessions_file_id on cv_sessions(file_id);
create index if not exists idx_cv_sessions_session_id on cv_sessions(session_id);

-- 2. Auto-delete rows older than 24 hours (run as a cron or use Supabase scheduled functions)
-- Optional: enable pg_cron extension and add:
-- select cron.schedule('cleanup-old-sessions', '0 * * * *',
--   $$delete from cv_sessions where created_at < now() - interval '24 hours'$$
-- );

-- 3. Storage bucket (create in Dashboard → Storage → New bucket)
-- Bucket name: cv-files
-- Public: NO (private — files served via signed URLs only)
-- File size limit: 10MB
