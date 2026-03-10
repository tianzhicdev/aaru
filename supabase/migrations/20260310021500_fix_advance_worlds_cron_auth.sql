do $$
begin
  if exists (select 1 from cron.job where jobname = 'aaru-advance-worlds') then
    perform cron.unschedule('aaru-advance-worlds');
  end if;
exception when undefined_table then
  null;
end
$$;

do $$
begin
  perform cron.schedule(
    'aaru-advance-worlds',
    '* * * * *',
    $cron$
      select
        net.http_post(
          url := 'https://uuggqsywcpqmbqzwxdga.supabase.co/functions/v1/advance-worlds',
          headers := '{
            "Content-Type":"application/json",
            "Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk3NjIsImV4cCI6MjA4ODY2NTc2Mn0.zRFOTxQiwF7NJXhKTsnU0G1Zv9E8l_zByb8EZ04OWJ0",
            "apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk3NjIsImV4cCI6MjA4ODY2NTc2Mn0.zRFOTxQiwF7NJXhKTsnU0G1Zv9E8l_zByb8EZ04OWJ0"
          }'::jsonb,
          body := '{"source":"pg_cron"}'::jsonb
        );
    $cron$
  );
exception when undefined_function then
  null;
end
$$;
