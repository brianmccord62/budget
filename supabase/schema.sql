-- Supabase schema for the Connected Financial Advisor app.
-- Run this in Supabase SQL editor after creating your project.

create extension if not exists "uuid-ossp";

create table if not exists households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'My Household',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique(household_id, user_id)
);

create table if not exists plaid_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  household_id uuid not null references households(id) on delete cascade,
  item_id text not null unique,
  institution_id text,
  institution_name text,
  access_token text not null,
  sync_cursor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  item_id text not null,
  plaid_account_id text not null unique,
  name text,
  official_name text,
  type text,
  subtype text,
  mask text,
  current_balance numeric,
  available_balance numeric,
  iso_currency_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  item_id text not null,
  plaid_account_id text not null,
  plaid_transaction_id text not null unique,
  name text,
  merchant_name text,
  amount numeric not null,
  iso_currency_code text,
  date date not null,
  pending boolean not null default false,
  payment_channel text,
  plaid_category jsonb,
  plaid_personal_finance_category jsonb,
  category text not null default 'Uncategorized',
  notes text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists category_rules (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  pattern text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists budget_months (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  month date not null,
  planned_income numeric not null default 0,
  planned_savings numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(household_id, month)
);

create table if not exists budget_categories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  budget_month_id uuid not null references budget_months(id) on delete cascade,
  category text not null,
  planned_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(budget_month_id, category)
);

create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  target numeric not null default 0,
  current numeric not null default 0,
  monthly numeric not null default 0,
  priority text not null default 'Medium',
  created_at timestamptz not null default now()
);

alter table households enable row level security;
alter table household_members enable row level security;
alter table plaid_items enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table category_rules enable row level security;
alter table budget_months enable row level security;
alter table budget_categories enable row level security;
alter table savings_goals enable row level security;

-- Simple RLS policies for signed-in users who belong to the same household.
-- The server-side service role bypasses RLS for Plaid sync API routes.

create policy "household members can view households"
on households for select
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = households.id
    and hm.user_id = auth.uid()
  )
);

create policy "users can create households"
on households for insert
with check (created_by = auth.uid());

create policy "members can view household_members"
on household_members for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from household_members hm
    where hm.household_id = household_members.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "users can join/create own membership"
on household_members for insert
with check (user_id = auth.uid());

create policy "members can view plaid item metadata"
on plaid_items for select
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = plaid_items.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can view accounts"
on accounts for select
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = accounts.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can view transactions"
on transactions for select
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = transactions.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can update transaction categories"
on transactions for update
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = transactions.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can manage category rules"
on category_rules for all
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = category_rules.household_id
    and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = category_rules.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can manage budget months"
on budget_months for all
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = budget_months.household_id
    and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = budget_months.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can manage budget categories"
on budget_categories for all
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = budget_categories.household_id
    and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = budget_categories.household_id
    and hm.user_id = auth.uid()
  )
);

create policy "members can manage savings goals"
on savings_goals for all
using (
  exists (
    select 1 from household_members hm
    where hm.household_id = savings_goals.household_id
    and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from household_members hm
    where hm.household_id = savings_goals.household_id
    and hm.user_id = auth.uid()
  )
);
