-- Run this in Supabase Dashboard → SQL Editor
-- Phase 5 schema additions — pre-payment lead capture + upload-flow support

-- 1. Leads — upserted at every journey checkpoint (details submitted,
--    template selected, payment initiated, payment completed), so this
--    always reflects the furthest stage a candidate reached even if
--    they abandon. Mirrors what gets pushed to Zoho CRM.
create table if not exists cv_leads (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null unique,
  name        text,
  email       text not null,
  phone       text not null,
  notes       text,
  stage       text,
  template    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_cv_leads_email on cv_leads(email);
create index if not exists idx_cv_leads_created_at on cv_leads(created_at desc);

-- 2. Track which flow produced each session (upload vs scratch) for funnel analysis
alter table cv_sessions
  add column if not exists mode text default 'scratch';

-- 3. Admin view — leads alongside whether they converted to a paid session
create or replace view admin_leads as
select
  l.id,
  l.session_id,
  l.email,
  l.phone,
  l.notes,
  l.created_at,
  case when s.id is not null then true else false end as converted,
  s.amount_paise,
  s.created_at as converted_at
from cv_leads l
left join cv_sessions s on s.session_id = l.session_id
order by l.created_at desc;
