-- Supabase keep-alive 用の非個人データテーブル。
-- この SQL は自動適用しない。Supabase 側の権限変更として、レビュー後に手動で適用する。
--
-- 目的:
-- - GitHub Actions から publishable key（未ログイン = anon）で DB への read を成立させる。
-- - progress テーブルや個人の学習履歴には触れない。
-- - service_role / secret key を使用しない。

create table if not exists public.health_check (
  id smallint primary key,
  constraint health_check_single_row check (id = 1)
);

insert into public.health_check (id)
values (1)
on conflict (id) do nothing;

alter table public.health_check enable row level security;

revoke all on table public.health_check from anon;
grant select on table public.health_check to anon;

drop policy if exists "health_check is publicly readable" on public.health_check;
create policy "health_check is publicly readable"
  on public.health_check
  for select
  to anon
  using (true);
