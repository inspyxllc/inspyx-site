-- The website's waitlist (2026-11-11).
--
-- inspyx.com's home page sends each sign-up here: join_waitlist() takes the
-- email and the two taps ("I am a", "Today I use") and answers 'ok',
-- 'invalid' or 'busy'. The page calls it with the project's publishable key,
-- the one that is meant to sit in a web page.
--
-- Lives in the site repo, beside the page that uses it.
--
-- STATUS: applied to inspyx-prod on 2026-11-11 as the migration
-- "website_waitlist" (20261111170433), on Moises's yes the same day.
-- Checked after applying:
--   * the live function's text is this file's, byte for byte;
--   * a visitor's browser may run join_waitlist() and has no rights on the
--     table (no reading, no direct insert);
--   * in a transaction that was rolled back, so nothing was kept: a new
--     email 'ok', the same email again 'ok' with no second row, five bad
--     addresses 'invalid', unknown taps stored as skipped.
-- The hourly limit ('busy' for the 121st new sign-up in an hour) was checked
-- in the dry run before applying, with this same text.
-- A later change goes in as a new migration, and this file is updated to
-- match it.
-- 2026-11-12: the notice of a new sign-up was added that way (the last part of
-- this file).
--
-- What a visitor's browser can do: run join_waitlist(), and nothing else.
-- It cannot read, change or count the list. An email that is already on the
-- list gets the same 'ok' as a new one, so nobody can test who has joined.

create table if not exists public.waitlist_signups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- Lower case, trimmed. One row per email.
  email text not null check (char_length(email) between 6 and 160),
  -- The two taps on the form; '' when a tap was skipped.
  who text not null default '' check (who in ('', 'solo', 'team', 'agent', 'investor')),
  uses text not null default '' check (uses in ('', 'spectora', 'other', 'none')),
  -- Where the form was (host and path) and which ad or link brought them
  -- (the page's utm values), when there is one. No cookies, no address of
  -- the visitor's device.
  page text not null default '',
  source text not null default '',
  -- The same email sent again is counted here, never stored twice.
  repeats integer not null default 0,
  last_seen_at timestamptz,
  -- Test rows: addresses at inspyx.com or example.com (Claude's checks, and
  -- Moises trying the form).
  is_test boolean not null default false
);

create unique index if not exists waitlist_signups_email_key
  on public.waitlist_signups (email);

comment on table public.waitlist_signups is
  'Website waitlist (2026-11-11): one row per email from the form on inspyx.com. Written only by join_waitlist(); no client role reads or writes it. Source: inspyx-site/backend/waitlist/schema.sql.';

-- Only join_waitlist() (below) and the service role touch the table.
alter table public.waitlist_signups enable row level security;
revoke all on public.waitlist_signups from anon, authenticated;

-- Adds one email to the waitlist.
--   'ok'       on the list (new, or already there)
--   'invalid'  not an email address
--   'busy'     more than 120 new sign-ups in the last hour (a guard against
--              a flood of made-up addresses); the page asks them to try again
create or replace function public.join_waitlist(
  p_email text,
  p_who text default '',
  p_uses text default '',
  p_page text default '',
  p_source text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_who text := lower(btrim(coalesce(p_who, '')));
  v_uses text := lower(btrim(coalesce(p_uses, '')));
  v_page text := left(regexp_replace(coalesce(p_page, ''), '[[:cntrl:]]', '', 'g'), 120);
  v_source text := left(regexp_replace(coalesce(p_source, ''), '[[:cntrl:]]', '', 'g'), 160);
  v_hourly_cap constant integer := 120;
begin
  if char_length(v_email) not between 6 and 160
     or v_email ~ '[[:cntrl:]]'
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid';
  end if;
  -- A tap the page does not know is stored as "skipped", never as sent.
  if v_who not in ('solo', 'team', 'agent', 'investor') then v_who := ''; end if;
  if v_uses not in ('spectora', 'other', 'none') then v_uses := ''; end if;

  -- One sign-up at a time, so the hourly count is exact.
  perform pg_advisory_xact_lock(hashtext('public.join_waitlist'));

  update public.waitlist_signups s
     set repeats = s.repeats + 1, last_seen_at = now()
   where s.email = v_email;
  if found then
    return 'ok';
  end if;

  if (select count(*) from public.waitlist_signups s
        where s.created_at > now() - interval '1 hour') >= v_hourly_cap then
    return 'busy';
  end if;

  insert into public.waitlist_signups (email, who, uses, page, source, is_test)
  values (v_email, v_who, v_uses, v_page, v_source,
          v_email ~ '@(inspyx\.com|example\.(com|org|net))$');
  return 'ok';
end;
$$;

comment on function public.join_waitlist(text, text, text, text, text) is
  'Website waitlist (2026-11-11): the one thing a visitor to inspyx.com may run. anon may execute it ON PURPOSE (the home page calls it with the publishable key). Source: inspyx-site/backend/waitlist/schema.sql.';

revoke all on function public.join_waitlist(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text, text, text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The notice of a new sign-up (2026-11-12).
--
-- Moises wants to hear of a sign-up right away, by email. The database sends
-- one line about each new sign-up to a Google Form owned by support@inspyx.com
-- ("Inspyx waitlist: new sign-up"), and Google emails support@ that the form
-- has a new response.
--
-- What the line says: the number of the sign-up, the two answers they tapped,
-- and which page and which ad or link brought them. It does NOT say their
-- email address: that stays in this table. So nothing about a person leaves
-- the database, and /privacy needs no new sentence for this.
--
-- The form's address is not in this file, because this repo is public and
-- anyone holding the address could send the form a made-up answer. It is kept
-- in the project's Vault under the name 'waitlist_notice_url'. With no such
-- secret, no notice is sent and sign-ups go on as before.
--
-- The request is handed to pg_net, which sends it after the sign-up is kept:
-- a visitor never waits for Google, and a notice that fails never fails a
-- sign-up. Test rows (addresses at inspyx.com or example.com) tell nobody.
--
-- STATUS: applied to inspyx-prod on 2026-11-12 as the migrations
-- "waitlist_notice_pg_net" (the extension) and "waitlist_notice" (this text).

create extension if not exists pg_net with schema extensions;

create or replace function public.waitlist_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_count bigint;
  v_line text;
begin
  if new.is_test then
    return new;
  end if;
  begin
    select d.decrypted_secret into v_url
      from vault.decrypted_secrets d
     where d.name = 'waitlist_notice_url';
    if v_url is null or v_url !~ '^https://docs\.google\.com/forms/d/e/[A-Za-z0-9_-]+/formResponse$' then
      return new;
    end if;
    select count(*) into v_count from public.waitlist_signups s where not s.is_test;
    v_line := 'Sign-up no. ' || v_count || '. I am a: '
      || case new.who when 'solo' then 'Solo inspector' when 'team' then 'Team owner'
                      when 'agent' then 'Agent' when 'investor' then 'Investor' else '(not tapped)' end
      || '. Today I use: '
      || case new.uses when 'spectora' then 'Spectora' when 'other' then 'Another app'
                       when 'none' then 'Nothing yet' else '(not tapped)' end
      || '. Page: ' || coalesce(nullif(new.page, ''), '(none)')
      || case when new.source <> '' then '. Came by: ' || new.source else '' end
      || '. Their email address is in the waitlist, not in this note.';
    perform net.http_get(
      url := v_url,
      params := jsonb_build_object('entry.1993418100', v_line, 'submit', 'Submit'),
      timeout_milliseconds := 8000
    );
  exception when others then
    -- A notice that can't be sent must never stop a sign-up.
    null;
  end;
  return new;
end;
$$;

comment on function public.waitlist_notice() is
  'Website waitlist (2026-11-12): after a new, real sign-up, sends one line about it (never the email address) to the Google Form whose address is the Vault secret waitlist_notice_url, so that Google emails support@inspyx.com. Source: inspyx-site/backend/waitlist/schema.sql.';

revoke all on function public.waitlist_notice() from public, anon, authenticated;

drop trigger if exists waitlist_notice on public.waitlist_signups;
create trigger waitlist_notice
  after insert on public.waitlist_signups
  for each row execute function public.waitlist_notice();
