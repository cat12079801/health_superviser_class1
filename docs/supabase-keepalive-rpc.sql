-- Supabase SQL Editor から対象プロジェクトに適用する。
-- 学習履歴 public.progress の RLS / GRANT / データは変更しない。
-- SECURITY INVOKER で DB のシステムカタログを読み、個人データは返さない。
-- 戻り値は公開スキーマが存在する場合に true となる。

create or replace function public.keepalive_ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_namespace
    where nspname = 'public'
  );
$$;

-- PostgreSQL は新規関数に PUBLIC への EXECUTE を既定付与するため明示的に剥奪する。
revoke all on function public.keepalive_ping() from public;
revoke all on function public.keepalive_ping() from anon;
revoke all on function public.keepalive_ping() from authenticated;
grant execute on function public.keepalive_ping() to anon;

-- PostgREST のスキーマキャッシュに新規 RPC を反映する。
notify pgrst, 'reload schema';
