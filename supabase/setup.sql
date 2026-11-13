-- KlassenKompass: Datenbank einrichten (einmalig im Supabase SQL Editor ausführen)
-- Gespeichert wird je Konto nur ein verschlüsselter Datenblock. Ohne Passwort der Person ist er nicht lesbar.

create table if not exists public.vaults (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  ciphertext text not null,
  iv         text not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint vault_size check (length(ciphertext) <= 2000000)
);

alter table public.vaults enable row level security;

drop policy if exists "eigener Tresor lesen" on public.vaults;
create policy "eigener Tresor lesen" on public.vaults for select to authenticated using ((select auth.uid()) = user_id);

-- Schreiben nur über die Funktion unten (mit Versionsprüfung gegen gleichzeitige Änderungen)
revoke insert, update, delete on public.vaults from anon, authenticated;

create or replace function public.save_vault(p_ciphertext text, p_iv text, p_expected integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new integer;
begin
  if v_uid is null then raise exception 'nicht angemeldet' using errcode = '28000'; end if;
  if p_expected = 0 then
    insert into public.vaults (user_id, ciphertext, iv) values (v_uid, p_ciphertext, p_iv)
    on conflict (user_id) do nothing returning version into v_new;
  else
    update public.vaults set ciphertext = p_ciphertext, iv = p_iv, version = version + 1, updated_at = now()
    where user_id = v_uid and version = p_expected returning version into v_new;
  end if;
  if v_new is null then raise exception 'version_conflict' using errcode = 'P0001'; end if;
  return v_new;
end;
$$;

revoke all on function public.save_vault(text, text, integer) from public, anon;
grant execute on function public.save_vault(text, text, integer) to authenticated;

-- Konto samt Daten löschen (für „Konto löschen“ in der App)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Wachhalten: wird vom GitHub-Workflow regelmäßig aufgerufen, damit das kostenlose Projekt nicht pausiert
create or replace function public.ping()
returns text language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;

-- ---------- Kartenquiz live (ab Version 1.6.0) ----------
-- Ein Gerät zeigt das Quiz (control), ein anderes scannt die Karten (scans). Beide gehören zum selben Konto.
-- Gespeichert wird je Konto höchstens eine Zeile; beide Teile sind auf dem Gerät verschlüsselt (wie der Tresor).
create table if not exists public.live_quiz (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  control    text,
  control_iv text,
  scans      text,
  scans_iv   text,
  updated_at timestamptz not null default now(),
  constraint live_size check (coalesce(length(control), 0) <= 300000 and coalesce(length(scans), 0) <= 300000)
);

alter table public.live_quiz enable row level security;

drop policy if exists "eigenes Live-Quiz lesen" on public.live_quiz;
create policy "eigenes Live-Quiz lesen" on public.live_quiz for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.live_quiz from anon, authenticated;

create or replace function public.set_live_quiz(p_part text, p_ciphertext text, p_iv text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'nicht angemeldet' using errcode = '28000'; end if;
  if p_part = 'control' then
    insert into public.live_quiz (user_id, control, control_iv) values (v_uid, p_ciphertext, p_iv)
    on conflict (user_id) do update set control = excluded.control, control_iv = excluded.control_iv, updated_at = now();
  elsif p_part = 'scans' then
    insert into public.live_quiz (user_id, scans, scans_iv) values (v_uid, p_ciphertext, p_iv)
    on conflict (user_id) do update set scans = excluded.scans, scans_iv = excluded.scans_iv, updated_at = now();
  else
    raise exception 'unbekannter Teil';
  end if;
  -- Aufräumen: Live-Daten, die seit einem Tag nicht mehr benutzt wurden
  delete from public.live_quiz where updated_at < now() - interval '1 day';
end;
$$;
revoke all on function public.set_live_quiz(text, text, text) from public, anon;
grant execute on function public.set_live_quiz(text, text, text) to authenticated;

create or replace function public.clear_live_quiz()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  delete from public.live_quiz where user_id = auth.uid();
end;
$$;
revoke all on function public.clear_live_quiz() from public, anon;
grant execute on function public.clear_live_quiz() to authenticated;

-- ---------- Quiz-Bilder im Konto (ab Version 1.8.0) ----------
-- Bilder liegen im Dateispeicher (nicht in der Datenbank), je Konto im Ordner <user_id>/.
-- Sie werden auf dem Gerät verschlüsselt; der Server speichert nur unlesbare Daten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-images', 'quiz-images', false, 3145728, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "eigene Quiz-Bilder lesen" on storage.objects;
create policy "eigene Quiz-Bilder lesen" on storage.objects for select to authenticated
  using (bucket_id = 'quiz-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "eigene Quiz-Bilder anlegen" on storage.objects;
create policy "eigene Quiz-Bilder anlegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'quiz-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "eigene Quiz-Bilder ersetzen" on storage.objects;
create policy "eigene Quiz-Bilder ersetzen" on storage.objects for update to authenticated
  using (bucket_id = 'quiz-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'quiz-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "eigene Quiz-Bilder löschen" on storage.objects;
create policy "eigene Quiz-Bilder löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'quiz-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Schlüssel für die Bilder: zufällig je Konto, mit dem Passwort-Schlüssel verschlüsselt
create table if not exists public.image_keys (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  ciphertext text not null,
  iv         text not null,
  updated_at timestamptz not null default now(),
  constraint image_key_size check (length(ciphertext) <= 1000)
);
alter table public.image_keys enable row level security;
drop policy if exists "eigenen Bilder-Schlüssel lesen" on public.image_keys;
create policy "eigenen Bilder-Schlüssel lesen" on public.image_keys for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "eigenen Bilder-Schlüssel anlegen" on public.image_keys;
create policy "eigenen Bilder-Schlüssel anlegen" on public.image_keys for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "eigenen Bilder-Schlüssel ändern" on public.image_keys;
create policy "eigenen Bilder-Schlüssel ändern" on public.image_keys for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.image_keys from anon;
grant select, insert, update on public.image_keys to authenticated;

-- ---------- Neue Konten nur mit Schul-E-Mail-Adresse (ab Version 1.27.0) ----------
-- Die App prüft das schon vor dem Absenden; diese Prüfung im Server verhindert, dass jemand die App umgeht.
-- Bestehende Konten sind nicht betroffen (gilt nur beim Anlegen). Domain bei Bedarf hier und in js/config.js ändern.
create or replace function public.only_school_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) not like '%@kws-rw.de' then
    raise exception 'E-Mail-Adresse nicht berechtigt' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.only_school_emails() from public, anon, authenticated;

drop trigger if exists only_school_emails on auth.users;
create trigger only_school_emails before insert on auth.users
  for each row execute function public.only_school_emails();
