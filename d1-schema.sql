-- Cloudflare D1 schema for Make My CV (moved off Supabase 2026-08-06 —
-- the Supabase free-tier project went unreachable in production and its
-- replacement couldn't be confidently located; D1 doesn't auto-pause).
--
-- Applied via the D1 HTTP query API, not the dashboard SQL editor — see
-- lib/db.js. Reproduced here for reference / disaster recovery.
--
-- Notable difference from the old Postgres schema: generated .docx files
-- are stored base64-encoded directly in cv_sessions.docx_data rather than
-- in a separate object store (R2 needs its own account-level subscription
-- we deliberately avoided; CVs are 50-150KB, trivial to keep in-row).

create table if not exists cv_sessions (
  id                     text primary key,
  session_id             text not null,
  file_id                text not null unique,
  name                   text,
  docx_data              text,           -- base64-encoded docx bytes
  paid                   integer default 0,
  email                  text,
  template               text default 'classic',
  mode                   text default 'scratch',
  razorpay_order_id      text,
  razorpay_payment_id    text,
  amount_paise           integer default 19900,
  status                 text default 'completed',  -- 'completed' | 'failed'
  model_used             text,
  stop_reason            text,
  input_tokens           integer,
  output_tokens          integer,
  cache_creation_tokens  integer,
  cache_read_tokens      integer,
  generation_attempts    integer default 1,
  error_message          text,
  error_reason           text,
  created_at             text not null
);

create index if not exists idx_cv_sessions_file_id on cv_sessions(file_id);
create index if not exists idx_cv_sessions_session_id on cv_sessions(session_id);

create table if not exists cv_leads (
  id          text primary key,
  session_id  text not null unique,
  name        text,
  email       text not null,
  phone       text not null,
  notes       text,
  stage       text,
  template    text,
  created_at  text not null,
  updated_at  text not null
);

create index if not exists idx_cv_leads_email on cv_leads(email);
create index if not exists idx_cv_leads_created_at on cv_leads(created_at desc);

-- Reused for the checkout-time bundled add-on (+₹99, see
-- functions/api/generate.js) since 2026-08-07 — originally built for a
-- separate ₹49 post-purchase upsell flow (now deprecated, see
-- functions/api/linkedin.js). payment_id is the SAME razorpay_payment_id
-- as the parent cv_sessions row when bundled, not a distinct charge.
-- docx_data added via ALTER TABLE 2026-08-07, same base64-in-row pattern
-- as cv_sessions.docx_data.
create table if not exists linkedin_orders (
  id          text primary key,
  session_id  text not null,
  file_id     text not null,
  payment_id  text,
  headline    text,
  about       text,
  docx_data   text,
  created_at  text not null
);

create index if not exists idx_linkedin_file_id on linkedin_orders(file_id);

-- SQLite has no CREATE OR REPLACE VIEW — drop first if re-running.
drop view if exists admin_orders;
create view admin_orders as
select
  s.id, s.session_id, s.file_id, s.name, s.email, s.template,
  s.razorpay_order_id, s.razorpay_payment_id, s.amount_paise, s.status,
  s.paid, s.created_at,
  case when l.id is not null then 1 else 0 end as has_linkedin
from cv_sessions s
left join linkedin_orders l on l.file_id = s.file_id
order by s.created_at desc;

drop view if exists admin_leads;
create view admin_leads as
select
  l.id, l.session_id, l.email, l.phone, l.notes, l.created_at,
  case when s.id is not null then 1 else 0 end as converted,
  s.amount_paise, s.created_at as converted_at
from cv_leads l
left join cv_sessions s on s.session_id = l.session_id
order by l.created_at desc;

drop view if exists admin_failed_generations;
create view admin_failed_generations as
select
  session_id, email, template, mode, razorpay_order_id, razorpay_payment_id,
  error_message, error_reason, created_at
from cv_sessions
where status = 'failed'
order by created_at desc;
