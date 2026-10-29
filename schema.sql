-- MathPhysics AI starter database schema
-- Run in Supabase SQL Editor.
-- These tables are prepared for later frontend authentication/history integration.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled problem' check (char_length(title) <= 160),
  subject text not null default 'mathematics' check (subject in ('mathematics','physics','other')),
  problem_text text not null check (char_length(problem_text) <= 10000),
  solution_text text check (char_length(solution_text) <= 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_problems_user_created_idx
  on public.saved_problems(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.saved_problems enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can view their own saved problems" on public.saved_problems;
create policy "Users can view their own saved problems"
  on public.saved_problems for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own saved problems" on public.saved_problems;
create policy "Users can create their own saved problems"
  on public.saved_problems for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved problems" on public.saved_problems;
create policy "Users can update their own saved problems"
  on public.saved_problems for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved problems" on public.saved_problems;
create policy "Users can delete their own saved problems"
  on public.saved_problems for delete
  to authenticated
  using (auth.uid() = user_id);

-- No public/anonymous access is granted to personal data.
-- Add authentication UI and test RLS before enabling saved-history features.
