-- ============================================================================
-- SweaTies — private groups, invite codes, comment reactions, realtime
--
-- The app used to be a single fixed roster (the "family"). SweaTies is a
-- Strava-style social app for closed circles: anyone can sign up, create a
-- private group (friends, an office team) and invite others with a code.
--
-- Data model: an athlete's workouts belong to the athlete, not to a group.
-- Visibility is "you can see an athlete's data iff you share at least one
-- group with them" (or it's you). Leaderboards and feeds are scoped to the
-- group the user is currently viewing, in the query layer.
--
-- Supersedes (never rewrites) the roster/claim migrations:
--   * athlete_claim_status view + claim_athlete_with_phone + login_with_phone
--     are dropped — there is no pre-seeded roster any more.
--   * every "claimed" SELECT policy is replaced with a shared-group policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- 10 hex chars from a CSPRNG-backed uuid. Possession of the code is the
  -- only thing that lets someone join, so it is rotatable by group admins.
  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by uuid references public.athletes (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, athlete_id)
);

create index group_members_athlete_idx on public.group_members (athlete_id);

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, athlete_id, emoji)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.comment_reactions enable row level security;

-- ----------------------------------------------------------------------------
-- Helpers (security definer so policies can consult membership without
-- recursing through group_members' own RLS).
-- ----------------------------------------------------------------------------
create or replace function public.my_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id from public.group_members where athlete_id = public.current_athlete_id();
$$;

create or replace function public.shares_group_with(other_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select other_athlete_id = public.current_athlete_id()
    or exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.athlete_id = public.current_athlete_id()
        and theirs.athlete_id = other_athlete_id
    );
$$;

-- ----------------------------------------------------------------------------
-- Backfill: if this database already has a roster (the old family app),
-- keep it together as a group called "Family" so nobody loses their feed.
-- ----------------------------------------------------------------------------
do $$
declare
  first_athlete uuid;
  family_group uuid;
begin
  select id into first_athlete from public.athletes order by created_at asc limit 1;
  if first_athlete is not null then
    insert into public.groups (name, created_by) values ('Family', first_athlete)
    returning id into family_group;

    insert into public.group_members (group_id, athlete_id, role)
    select family_group, a.id, case when a.id = first_athlete then 'admin' else 'member' end
    from public.athletes a;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Drop the roster-claim surface.
-- ----------------------------------------------------------------------------
drop view if exists public.athlete_claim_status;
drop function if exists public.claim_athlete_with_phone(uuid, text);
drop function if exists public.login_with_phone(uuid, text);

-- ----------------------------------------------------------------------------
-- Sign up / sign in (anonymous Supabase session + phone number as the
-- lightweight credential — unchanged product decision, new shape: the user
-- creates their own athlete row instead of claiming a pre-seeded one).
-- ----------------------------------------------------------------------------
create or replace function public.sign_up_with_phone(display_name text, phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  clean_name text := btrim(display_name);
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 40 then
    raise exception 'Enter a name between 1 and 40 characters.';
  end if;
  if phone !~ '^\+91[0-9]{10}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number.';
  end if;
  if exists (select 1 from public.athletes where auth_user_id = auth.uid()) then
    raise exception 'This device is already signed in.';
  end if;

  insert into public.athletes (name, phone_number, auth_user_id)
  values (clean_name, phone, auth.uid())
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'That number is already registered — sign in instead.';
end;
$$;

create or replace function public.sign_in_with_phone(phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if phone !~ '^\+91[0-9]{10}$' then
    raise exception 'That number isn''t registered.';
  end if;

  -- Free this session from any other profile first (auth_user_id is unique).
  update public.athletes
  set auth_user_id = null
  where auth_user_id = auth.uid()
    and phone_number is distinct from phone;

  update public.athletes
  set auth_user_id = auth.uid()
  where phone_number = phone
  returning id into linked_id;

  if linked_id is null then
    raise exception 'That number isn''t registered.';
  end if;
end;
$$;

grant execute on function public.sign_up_with_phone(text, text) to authenticated;
grant execute on function public.sign_in_with_phone(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Group RPCs
-- ----------------------------------------------------------------------------
create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_athlete_id();
  new_group uuid;
begin
  if me is null then
    raise exception 'Finish signing up first.';
  end if;
  if char_length(btrim(group_name)) < 1 or char_length(btrim(group_name)) > 40 then
    raise exception 'Group names are 1 to 40 characters.';
  end if;

  insert into public.groups (name, created_by) values (btrim(group_name), me)
  returning id into new_group;

  insert into public.group_members (group_id, athlete_id, role)
  values (new_group, me, 'admin');

  return new_group;
end;
$$;

create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_athlete_id();
  target uuid;
begin
  if me is null then
    raise exception 'Finish signing up first.';
  end if;

  select id into target from public.groups where invite_code = upper(btrim(code));
  if target is null then
    raise exception 'That invite code doesn''t match any group.';
  end if;

  insert into public.group_members (group_id, athlete_id)
  values (target, me)
  on conflict do nothing;

  return target;
end;
$$;

create or replace function public.leave_group(target_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_athlete_id();
  my_role text;
  successor uuid;
begin
  select role into my_role from public.group_members
  where group_id = target_group and athlete_id = me;
  if my_role is null then
    return;
  end if;

  delete from public.group_members where group_id = target_group and athlete_id = me;

  if not exists (select 1 from public.group_members where group_id = target_group) then
    delete from public.groups where id = target_group;
  elsif my_role = 'admin'
    and not exists (
      select 1 from public.group_members where group_id = target_group and role = 'admin'
    ) then
    select athlete_id into successor from public.group_members
    where group_id = target_group order by joined_at asc limit 1;
    update public.group_members set role = 'admin'
    where group_id = target_group and athlete_id = successor;
  end if;
end;
$$;

create or replace function public.rotate_invite_code(target_group uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  update public.groups g
  set invite_code = new_code
  where g.id = target_group
    and exists (
      select 1 from public.group_members m
      where m.group_id = g.id
        and m.athlete_id = public.current_athlete_id()
        and m.role = 'admin'
    );

  if not found then
    raise exception 'Only a group admin can reset the invite code.';
  end if;

  return new_code;
end;
$$;

grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS: groups, group_members, comment_reactions
-- No direct INSERT/UPDATE/DELETE grants on groups/group_members — all
-- mutations go through the RPCs above.
-- ----------------------------------------------------------------------------
create policy "groups_select_member"
on public.groups for select
to authenticated
using (id in (select public.my_group_ids()));

create policy "group_members_select_same_group"
on public.group_members for select
to authenticated
using (group_id in (select public.my_group_ids()));

create policy "comment_reactions_select_visible"
on public.comment_reactions for select
to authenticated
using (exists (select 1 from public.comments c where c.id = comment_id));

create policy "comment_reactions_insert_as_self"
on public.comment_reactions for insert
to authenticated
with check (
  athlete_id = public.current_athlete_id()
  and exists (select 1 from public.comments c where c.id = comment_id)
);

create policy "comment_reactions_delete_own"
on public.comment_reactions for delete
to authenticated
using (athlete_id = public.current_athlete_id());

grant select on public.groups to authenticated, service_role;
grant select on public.group_members to authenticated, service_role;
grant select, insert, delete on public.comment_reactions to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Replace "any claimed member can read everything" with shared-group reads.
-- ----------------------------------------------------------------------------
drop policy "athletes_select_claimed" on public.athletes;
create policy "athletes_select_shared_group"
on public.athletes for select
to authenticated
using (public.shares_group_with(id));

drop policy "activities_select_claimed" on public.activities;
create policy "activities_select_shared_group"
on public.activities for select
to authenticated
using (public.shares_group_with(athlete_id));

-- These three follow their parent activity (the subquery is itself subject
-- to activities' RLS because the policy runs as the invoker).
drop policy "activity_entry_types_select_claimed" on public.activity_entry_types;
create policy "activity_entry_types_select_visible"
on public.activity_entry_types for select
to authenticated
using (exists (select 1 from public.activities a where a.id = activity_id));

drop policy "comments_select_claimed" on public.comments;
create policy "comments_select_visible"
on public.comments for select
to authenticated
using (exists (select 1 from public.activities a where a.id = activity_id));

drop policy "kudos_select_claimed" on public.kudos;
create policy "kudos_select_visible"
on public.kudos for select
to authenticated
using (exists (select 1 from public.activities a where a.id = activity_id));

drop policy "activity_photos_select_authenticated" on public.activity_photos;
create policy "activity_photos_select_shared_group"
on public.activity_photos for select
to authenticated
using (public.shares_group_with(athlete_id));

-- Writes on comments/kudos must also be limited to activities you can see,
-- otherwise someone could comment on a stranger's activity by guessing ids.
drop policy "comments_insert_as_self" on public.comments;
create policy "comments_insert_as_self"
on public.comments for insert
to authenticated
with check (
  athlete_id = public.current_athlete_id()
  and exists (select 1 from public.activities a where a.id = activity_id)
);

drop policy "kudos_insert_not_self" on public.kudos;
create policy "kudos_insert_not_self"
on public.kudos for insert
to authenticated
with check (
  athlete_id = public.current_athlete_id()
  and activity_id not in (
    select id from public.activities where athlete_id = public.current_athlete_id()
  )
  and exists (select 1 from public.activities a where a.id = activity_id)
);

-- Storage: photos are readable by anyone who shares a group with the
-- uploader (first path segment is the uploader's athlete id).
drop policy "activity_photos_select_authenticated" on storage.objects;
create policy "activity_photos_select_shared_group"
on storage.objects for select
to authenticated
using (
  bucket_id = 'activity-photos'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.shares_group_with(((storage.foldername(name))[1])::uuid)
);

-- ----------------------------------------------------------------------------
-- Realtime: the app subscribes to these to update feeds live. Realtime
-- evaluates the RLS policies above for each subscriber, so a user only
-- receives changes they could SELECT.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.activities, public.kudos, public.comments, public.comment_reactions;
  end if;
end;
$$;
