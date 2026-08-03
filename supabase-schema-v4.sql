-- Run this in Supabase Dashboard → SQL Editor
-- Phase 6 schema additions — Claude generation observability + failure tracking
-- (added while wiring retry/backoff, token/cost logging, and a graceful
--  failure path per the ai-api-integration audit)

-- 1. Cost/usage attribution per generation — captured from Claude's
--    response.usage on every successful call, so real per-CV cost and
--    whether prompt caching is engaging (cache_read_tokens > 0) are both
--    visible instead of guessed.
alter table cv_sessions add column if not exists model_used text;
alter table cv_sessions add column if not exists stop_reason text;
alter table cv_sessions add column if not exists input_tokens integer;
alter table cv_sessions add column if not exists output_tokens integer;
alter table cv_sessions add column if not exists cache_creation_tokens integer;
alter table cv_sessions add column if not exists cache_read_tokens integer;
alter table cv_sessions add column if not exists generation_attempts integer default 1;

-- 2. Failure tracking — a customer who paid but whose generation failed
--    after retries previously left NO record anywhere except ephemeral
--    Vercel function logs. Now written via saveFailedGeneration().
--    (status already exists as a column — 'completed' | 'failed'.)
alter table cv_sessions add column if not exists error_message text;
alter table cv_sessions add column if not exists error_reason text;

-- 3. Ops view — paid-but-unfulfilled orders that need manual follow-up
--    (regenerate manually, or refund via Razorpay).
create or replace view admin_failed_generations as
select
  session_id,
  email,
  template,
  mode,
  razorpay_order_id,
  razorpay_payment_id,
  error_message,
  error_reason,
  created_at
from cv_sessions
where status = 'failed'
order by created_at desc;
