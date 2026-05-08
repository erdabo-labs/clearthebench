-- Spectator push notifications: watch codes + subscription storage

create or replace function generate_watch_code() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..5 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

alter table ctb_games add column if not exists watch_code text unique;
update ctb_games set watch_code = generate_watch_code() where watch_code is null;
alter table ctb_games alter column watch_code set default generate_watch_code();

-- Spectator push subscriptions — no coach_id, keyed by game + endpoint
create table if not exists ctb_spectator_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references ctb_games(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique (game_id, endpoint)
);

alter table ctb_spectator_push_subscriptions enable row level security;

-- Anon can subscribe/unsubscribe; only service role can read (edge function)
create policy "anon_write" on ctb_spectator_push_subscriptions
  for all to anon using (true) with check (true);
