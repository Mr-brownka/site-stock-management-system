-- Company above sites: Comex Builders runs Reveal, Astana, Nyayo View 2 and Balozi Suites.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
revoke all on public.companies from anon;
grant select on public.companies to authenticated;

insert into public.companies (name) values ('Comex Builders');

alter table public.sites add column company_id uuid references public.companies;
update public.sites set company_id = (select id from public.companies where name = 'Comex Builders');
alter table public.sites alter column company_id set not null;
alter table public.sites add constraint sites_company_name_unique unique (company_id, name);

update public.sites set name = 'Reveal' where name = 'Main site';
insert into public.sites (name, company_id, created_at)
select n, (select id from public.companies where name = 'Comex Builders'), now() + (o || ' seconds')::interval
from (values ('Astana', 1), ('Nyayo View 2', 2), ('Balozi Suites', 3)) v(n, o);

create policy "own company" on public.companies for select to authenticated
  using (id = (select s.company_id from public.sites s where s.id = public.my_site_id()));
