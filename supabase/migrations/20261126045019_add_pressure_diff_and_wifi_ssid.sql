-- YPT for me: Add pressure change metrics (3h / 6h delta in hPa) and private Wi-Fi SSID support.
-- All columns are nullable so active study sessions are completely unaffected.

alter table public.spots
  add column if not exists wifi_ssid text;

alter table public.study_sessions
  add column if not exists wifi_ssid text,
  add column if not exists pressure_diff_3h real,
  add column if not exists pressure_diff_6h real;
