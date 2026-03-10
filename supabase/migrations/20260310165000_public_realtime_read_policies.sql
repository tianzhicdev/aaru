create policy "public read agent_positions"
on public.agent_positions
for select
using (true);

create policy "public read conversations"
on public.conversations
for select
using (true);

create policy "public read messages"
on public.messages
for select
using (true);

create policy "public read impression_edges"
on public.impression_edges
for select
using (true);

create policy "public read ba_messages"
on public.ba_messages
for select
using (true);
