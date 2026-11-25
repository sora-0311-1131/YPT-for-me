-- YPT for me: Initial Schema Migration
-- Single-user personal study tracker with nested spots, weather/period enrichment,
-- offline sync idempotency, and privacy-safe realtime signaling.

-- 1. Singleton application settings
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  day_boundary_hour smallint not null default 4 check (day_boundary_hour between 0 and 6),
  streak_min_minutes integer not null default 30 check (streak_min_minutes >= 0),
  daily_goal_weekday_min integer not null default 180 check (daily_goal_weekday_min > 0),
  daily_goal_weekend_min integer not null default 360 check (daily_goal_weekend_min > 0),
  long_session_warn_min integer not null default 360 check (long_session_warn_min > 0),
  univ_periods jsonb not null default '[
    {"key": "morning", "label": "朝", "start": "04:00", "end": "08:50"},
    {"key": "period_1", "label": "1限", "start": "08:50", "end": "10:20"},
    {"key": "period_2", "label": "2限", "start": "10:30", "end": "12:00"},
    {"key": "lunch", "label": "昼休み", "start": "12:00", "end": "13:00"},
    {"key": "period_3", "label": "3限", "start": "13:00", "end": "14:30"},
    {"key": "period_4", "label": "4限", "start": "14:40", "end": "16:10"},
    {"key": "period_5", "label": "5限", "start": "16:20", "end": "17:50"},
    {"key": "after_school", "label": "放課後", "start": "17:50", "end": "23:00"},
    {"key": "late_night", "label": "深夜", "start": "23:00", "end": "04:00"}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Study categories (5-track defaults, editable via /admin)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Private geofence spots (coordinates never exposed to public API/UI)
create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  spot_group text not null default 'Other' check (spot_group in ('Home', 'Univ', 'Cafe', 'Other')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 50 check (radius_m > 0),
  created_at timestamptz not null default now()
);

-- 4. Study sessions
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  spot_id uuid references public.spots(id) on delete set null,
  location_label text not null default 'Other',
  memo text,
  tag_id text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  weather_code smallint,
  temperature_c real,
  pressure_hpa real,
  day_type text check (day_type is null or day_type in ('weekday', 'weekend', 'holiday')),
  univ_period text,
  needs_review boolean not null default false,
  start_event_id text unique,
  stop_event_id text unique,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  created_at timestamptz not null default now(),
  constraint study_sessions_time_order_chk check (ended_at is null or ended_at >= started_at)
);

-- Guarantee at most 1 active session at the database level
create unique index if not exists study_sessions_single_active_idx
  on public.study_sessions ((1))
  where ended_at is null;

create index if not exists study_sessions_started_at_idx
  on public.study_sessions (started_at desc);

create index if not exists study_sessions_category_id_idx
  on public.study_sessions (category_id);

create index if not exists study_sessions_spot_id_idx
  on public.study_sessions (spot_id);

create index if not exists study_sessions_needs_review_idx
  on public.study_sessions (needs_review)
  where needs_review = true;

-- 5. Privacy-safe realtime signal table
-- Public clients subscribe only to this timestamp row and refetch sanitized DTOs from /api/dashboard,
-- keeping coordinates in study_sessions completely inaccessible to anon/public clients.
create table if not exists public.study_realtime_signals (
  id smallint primary key default 1 check (id = 1),
  updated_at timestamptz not null default now()
);

create or replace function public.bump_study_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.study_realtime_signals (id, updated_at)
  values (1, now())
  on conflict (id) do update set updated_at = excluded.updated_at;
  return null;
end;
$$;

create trigger study_sessions_realtime_signal_trg
  after insert or update or delete on public.study_sessions
  for each statement
  execute function public.bump_study_realtime_signal();

-- 6. Row-Level Security
alter table public.app_settings enable row level security;
alter table public.categories enable row level security;
alter table public.spots enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_realtime_signals enable row level security;

-- Only study_realtime_signals is readable by anon (for Realtime refetch notification)
create policy "Allow anon read realtime signal"
  on public.study_realtime_signals
  for select
  to anon
  using (true);

-- Add privacy-safe signal table to Supabase Realtime publication
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_realtime_signals'
  ) then
    alter publication supabase_realtime add table public.study_realtime_signals;
  end if;
end;
$$;

-- 7. Initial seed data (idempotent)
insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

insert into public.study_realtime_signals (id)
values (1)
on conflict (id) do nothing;

insert into public.categories (name, color, sort_order)
values
  ('大学講義・課題', '#3B82F6', 1),
  ('個人開発・A4', '#10B981', 2),
  ('資格（FE等）', '#F59E0B', 3),
  ('英語', '#8B5CF6', 4),
  ('その他', '#6B7280', 5)
on conflict (name) do nothing;
