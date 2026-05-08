-- Web Push: subscription storage and pending alert clock

create table if not exists ctb_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references ctb_coaches(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table ctb_push_subscriptions enable row level security;

create policy "own" on ctb_push_subscriptions
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- One row per active game; the cron edge function owns the fire_at clock
create table if not exists ctb_pending_alerts (
  game_id uuid primary key references ctb_games(id) on delete cascade,
  coach_id uuid references ctb_coaches(id) not null,
  fire_at timestamptz not null,
  interval_seconds int not null,
  active boolean default true
);

alter table ctb_pending_alerts enable row level security;

create policy "own" on ctb_pending_alerts
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
