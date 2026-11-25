-- Harden trigger functions and automatically refresh app_settings.updated_at on UPDATE

create or replace function public.set_app_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_app_settings_updated_at() from public, anon, authenticated;

create trigger app_settings_updated_at_trg
  before update on public.app_settings
  for each row
  execute function public.set_app_settings_updated_at();

revoke all on function public.bump_study_realtime_signal() from public, anon, authenticated;
