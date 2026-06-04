-- Run this in Supabase Dashboard → SQL Editor
-- Phase 3 + 4 schema additions

-- 1. Add new columns to cv_sessions
alter table cv_sessions
  add column if not exists email          text,
  add column if not exists template       text default 'classic',
  add column if not exists razorpay_order_id   text,
  add column if not exists razorpay_payment_id text,
  add column if not exists amount_paise   integer default 19900,
  add column if not exists status         text default 'completed';

-- 2. LinkedIn orders table
create table if not exists linkedin_orders (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  file_id     text not null,
  payment_id  text,
  headline    text,
  about       text,
  created_at  timestamptz default now()
);

create index if not exists idx_linkedin_file_id on linkedin_orders(file_id);

-- 3. Admin view — joins cv_sessions for dashboard
create or replace view admin_orders as
select
  s.id,
  s.session_id,
  s.file_id,
  s.name,
  s.email,
  s.template,
  s.razorpay_order_id,
  s.razorpay_payment_id,
  s.amount_paise,
  s.status,
  s.paid,
  s.created_at,
  case when l.id is not null then true else false end as has_linkedin
from cv_sessions s
left join linkedin_orders l on l.file_id = s.file_id
order by s.created_at desc;
