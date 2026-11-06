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
