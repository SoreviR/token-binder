// Tables of the online leagues. Every statement is idempotent ("if not exists"), so it runs on each cold start.
// One statement per entry: the serverless Postgres driver runs a single statement per call.
export const SCHEMA: string[] = [
  `-- Online leagues of TokenBinder. Safe to run again: everything is "if not exists".
create table if not exists players (
  id          bigint primary key,            -- GitHub user id
  login       text not null,                 -- GitHub login, shown to league mates
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
)`,
  `create table if not exists leagues (
  id          serial primary key,
  name        text not null,
  code        text not null unique,          -- invite code, e.g. K7MQ-4XPD
  owner       bigint not null references players(id) on delete cascade,
  created_at  timestamptz not null default now()
)`,
  `create table if not exists members (
  league_id   int not null references leagues(id) on delete cascade,
  player_id   bigint not null references players(id) on delete cascade,
  elo         int not null default 1000,
  wins        int not null default 0,
  losses      int not null default 0,
  joined_at   timestamptz not null default now(),
  primary key (league_id, player_id)
)`,
  `-- The card each player takes to duels (one per player, shared by all their leagues).
create table if not exists fighters (
  player_id   bigint primary key references players(id) on delete cascade,
  card_key    text not null,
  xp          bigint not null,
  grade       int,
  held        text,
  quota_pct   int not null default 0,
  updated_at  timestamptz not null default now()
)`,
  `create table if not exists duels (
  id            serial primary key,
  league_id     int not null references leagues(id) on delete cascade,
  challenger    bigint not null references players(id) on delete cascade,
  defender      bigint not null references players(id) on delete cascade,
  seed          bigint not null,
  battle_version int not null,
  a             jsonb not null,              -- challenger's fighter as it fought
  b             jsonb not null,              -- defender's fighter as it fought
  winner        text not null,               -- 'a' (challenger) or 'b' (defender)
  elo_change    int not null,                -- points the challenger gained (negative if they lost)
  rounds        int not null,
  log           jsonb not null,
  seen          boolean not null default false,   -- the defender already saw it
  created_at    timestamptz not null default now()
)`,
  `create index if not exists duels_defender_idx on duels (defender, seen)`,
  `create index if not exists duels_challenger_day_idx on duels (challenger, created_at)`,
  `-- Cards as TCGdex describes them: both duelists fight with the same data and prices.
create table if not exists cards (
  id          text primary key,
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
)`,
  `create table if not exists meta (
  k           text primary key,
  v           jsonb not null
)`,
  `-- One counter per challenger, per rival, per day, bumped atomically when a duel is reserved. 'defender = 0' is the
  -- per-day total across every rival. This is what enforces the daily limits: counting the duels table left a gap
  -- between the count and the insert, so firing many duels at once slipped past it.
create table if not exists duel_quota (
  challenger  bigint not null references players(id) on delete cascade,
  defender    bigint not null,               -- 0 = the whole-day total across all rivals
  day         date   not null,
  n           int    not null default 0,
  primary key (challenger, defender, day)
)`,
  `-- A member's standing kept when they leave, so rejoining a league restores their Elo and record instead of starting
  -- fresh at 1000 (which let a losing player wipe their losses by leaving and coming back).
create table if not exists member_stats (
  league_id   int not null references leagues(id) on delete cascade,
  player_id   bigint not null references players(id) on delete cascade,
  elo         int not null,
  wins        int not null,
  losses      int not null,
  primary key (league_id, player_id)
)`,
];
