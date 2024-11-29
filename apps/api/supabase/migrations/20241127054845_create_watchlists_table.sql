-- First create the table
create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coin_id text not null,
  created_at timestamptz not null default now(),
  unique(user_id, coin_id)
);

-- Enable RLS
alter table watchlists enable row level security;

-- Drop any existing policies
drop policy if exists "Enable read access for authenticated users" on watchlists;
drop policy if exists "Enable insert access for authenticated users" on watchlists;
drop policy if exists "Enable delete access for authenticated users" on watchlists;

-- Create new policies
create policy "Enable read access for authenticated users"
  on watchlists for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Enable insert access for authenticated users"
  on watchlists for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Enable delete access for authenticated users"
  on watchlists for delete
  to authenticated
  using (auth.uid() = user_id);

-- Index for faster queries
create index idx_watchlists_user_id on watchlists(user_id);