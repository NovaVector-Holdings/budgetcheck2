create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  monthly_income numeric(12,2),
  money_goal text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users can delete own profile" on public.profiles for delete to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.savings_goals to authenticated;
grant all on public.savings_goals to service_role;
alter table public.savings_goals enable row level security;
create policy "Users manage own savings goals" on public.savings_goals for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.savings_deposits (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null,
  note text,
  deposited_on date not null default current_date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.savings_deposits to authenticated;
grant all on public.savings_deposits to service_role;
alter table public.savings_deposits enable row level security;
create policy "Users manage own deposits" on public.savings_deposits for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  balance numeric(12,2) not null check (balance >= 0),
  apr numeric(5,2),
  minimum_payment numeric(12,2) check (minimum_payment >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.debts to authenticated;
grant all on public.debts to service_role;
alter table public.debts enable row level security;
create policy "Users manage own debts" on public.debts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.debt_payments to authenticated;
grant all on public.debt_payments to service_role;
alter table public.debt_payments enable row level security;
create policy "Users manage own debt payments" on public.debt_payments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.planned_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  category text not null default 'other',
  recurring text not null default 'none' check (recurring in ('none','weekly','monthly','yearly')),
  paid boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.planned_expenses to authenticated;
grant all on public.planned_expenses to service_role;
alter table public.planned_expenses enable row level security;
create policy "Users manage own planned expenses" on public.planned_expenses for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.money_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  held_on date not null default current_date,
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.money_meetings to authenticated;
grant all on public.money_meetings to service_role;
alter table public.money_meetings enable row level security;
create policy "Users manage own money meetings" on public.money_meetings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.alert_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expense_reminder_days integer not null default 3 check (expense_reminder_days between 0 and 30),
  low_funds_threshold numeric(12,2),
  weekly_summary boolean not null default true,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.alert_settings to authenticated;
grant all on public.alert_settings to service_role;
alter table public.alert_settings enable row level security;
create policy "Users manage own alert settings" on public.alert_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);