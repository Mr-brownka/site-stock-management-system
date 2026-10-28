-- Deleting an issue also removes the returns made against its lines (they cascade), and any return paper left empty.
create or replace function public._remove_document(doc_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
  ret_docs uuid[];
begin
  select * into d from public.documents where id = doc_id for update;
  if d.id is null then raise exception 'The entry no longer exists'; end if;
  if d.zoho_receive_id is not null then
    insert into public.zoho_seen (zoho_receive_id, project) values (d.zoho_receive_id, 'deleted in the system')
    on conflict (zoho_receive_id) do update set project = excluded.project;
  end if;
  select array_agg(distinct r.document_id) into ret_docs
    from public.movements r join public.movements m on r.return_of = m.id where m.document_id = d.id;
  delete from public.documents where corrects_document = d.id;
  delete from public.documents where id = d.id;
  if ret_docs is not null then
    delete from public.documents x where x.id = any(ret_docs) and not exists (select 1 from public.movements y where y.document_id = x.id);
  end if;
end $$;
revoke execute on function public._remove_document(uuid) from public, anon, authenticated;
