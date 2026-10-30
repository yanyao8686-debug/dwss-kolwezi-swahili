-- Keep the audit trail private to the server-side Edge Function.
create policy "deny public access to pronunciation correction history"
on public.dictionary_pronunciation_override_history
for all
to anon, authenticated
using (false)
with check (false);
