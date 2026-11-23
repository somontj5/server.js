-- Run ONCE in Supabase SQL Editor before enabling the server secrets.
-- Private service-only schema API. No anon/authenticated policies are installed.
begin;
create table if not exists public.gm_control (
 id boolean primary key default true check(id), revision bigint not null default 0,
 writer text, lease_until timestamptz, initialized boolean not null default false,
 last_commit text, updated_at timestamptz not null default now()
);
insert into public.gm_control(id) values(true) on conflict do nothing;
create table if not exists public.gm_users (
 id text primary key, payload jsonb not null,
 telegram_id text generated always as (payload->>'tgId') stored,
 whatsapp_phone text generated always as (payload->>'waPhone') stored,
 is_guest boolean generated always as (coalesce((payload->>'guest')::boolean,false)) stored
);
create table if not exists public.gm_listings (
 id text primary key, payload jsonb not null,
 seller_id text generated always as (payload->>'sellerId') stored,
 category text generated always as (payload->>'sub') stored,
 subcategory text generated always as (payload->>'section') stored,
 age_group text generated always as (payload#>>'{a,ageGroup}') stored,
 gender text generated always as (payload#>>'{a,gender}') stored,
 sizes jsonb generated always as (payload->'sizes') stored,
 material text generated always as (coalesce(payload->>'material',payload#>>'{a,mat}')) stored,
 price text generated always as (payload->>'price') stored,
 price_num numeric generated always as (nullif(payload->>'priceNum','')::numeric) stored,
 discount_price numeric generated always as (nullif(payload->>'discountPrice','')::numeric) stored,
 tags jsonb generated always as (payload->'tags') stored,
 archived boolean generated always as (coalesce((payload->>'archived')::boolean,false)) stored
 -- No expires_at: listings do not expire automatically.
);
create table if not exists public.gm_favorites (
 id text primary key, payload jsonb not null,
 user_id text generated always as (payload->>'userId') stored,
 listing_id text generated always as (payload->>'listingId') stored,
 unique(user_id,listing_id)
);
create table if not exists public.gm_sessions(id text primary key,payload jsonb not null);
create table if not exists public.gm_guest_accounts(id text primary key,payload jsonb not null);
create table if not exists public.gm_login_codes(
 id text primary key,payload jsonb not null,
 provider text generated always as (payload->>'provider') stored,
 expires_ms bigint generated always as ((payload->>'expiresAt')::bigint) stored,
 check(payload->>'provider' <> 'whatsapp' or
   ((payload->>'expiresAt')::bigint <= (payload->>'createdAt')::bigint + 300000))
);
create table if not exists public.gm_threads(
 id text primary key,payload jsonb not null,
 buyer_id text generated always as (payload->>'buyerId') stored,
 seller_id text generated always as (payload->>'sellerId') stored
);
create table if not exists public.gm_messages(
 id text primary key,payload jsonb not null,
 thread_id text generated always as (payload->>'threadId') stored,
 sender_id text generated always as (payload#>>'{message,from}') stored,
 sent_ms bigint generated always as ((payload#>>'{message,t}')::bigint) stored
);
create table if not exists public.gm_reviews(id text primary key,payload jsonb not null);
create table if not exists public.gm_searches(id text primary key,payload jsonb not null);
create table if not exists public.gm_metadata(id text primary key,payload jsonb not null);
create table if not exists public.gm_media(
 id text primary key,payload jsonb not null,
 object_path text generated always as (payload->>'path') stored,
 bytes bigint generated always as ((payload->>'bytes')::bigint) stored
);
create index if not exists gm_listings_category on public.gm_listings(category,subcategory,archived);
create index if not exists gm_listings_seller on public.gm_listings(seller_id);
create index if not exists gm_messages_thread on public.gm_messages(thread_id,sent_ms);
create index if not exists gm_threads_buyer on public.gm_threads(buyer_id);
create index if not exists gm_threads_seller on public.gm_threads(seller_id);
create index if not exists gm_login_expiry on public.gm_login_codes(expires_ms);

-- Anonymous clients cannot select, insert, update or delete any marketplace row.
do $$ declare t text; begin
 foreach t in array array['gm_control','gm_users','gm_listings','gm_favorites','gm_sessions','gm_guest_accounts','gm_login_codes','gm_threads','gm_messages','gm_reviews','gm_searches','gm_metadata','gm_media'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

-- One consistent snapshot; the writer is leased to prevent two agents/servers
-- from overwriting one another. Backups use p_claim=false and acquire no lease.
create or replace function public.gm_snapshot(p_writer text default '', p_claim boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c gm_control%rowtype; result jsonb; t text; rows jsonb;
begin
 select * into c from gm_control where id=true for update;
 if p_claim then
  if c.writer is not null and c.writer<>p_writer and c.lease_until>now() then
   raise exception 'Another server owns the database lease' using errcode='40001';
  end if;
  update gm_control set writer=p_writer,lease_until=now()+interval '90 seconds' where id=true;
 end if;
 result=jsonb_build_object('revision',c.revision,'initialized',c.initialized,'lastCommit',c.last_commit,'tables','{}'::jsonb);
 foreach t in array array['gm_users','gm_listings','gm_favorites','gm_sessions','gm_guest_accounts','gm_login_codes','gm_threads','gm_messages','gm_reviews','gm_searches','gm_metadata','gm_media'] loop
  execute format('select coalesce(jsonb_object_agg(id,payload),''{}''::jsonb) from public.%I',t) into rows;
  result=jsonb_set(result,array['tables',t],rows);
 end loop;
 return result;
end $$;

-- All changed rows and deletions are committed in ONE Postgres transaction.
-- Retrying a lost response is idempotent via p_commit, never a blind overwrite.
create or replace function public.gm_commit(p_writer text,p_revision bigint,p_commit text,p_upserts jsonb,p_deletes jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare c gm_control%rowtype; t text; rows jsonb; allowed text[]:=array['gm_users','gm_listings','gm_favorites','gm_sessions','gm_guest_accounts','gm_login_codes','gm_threads','gm_messages','gm_reviews','gm_searches','gm_metadata','gm_media'];
begin
 select * into c from gm_control where id=true for update;
 if c.writer is distinct from p_writer or c.lease_until<=now() then
  raise exception 'Database writer lease lost' using errcode='40001';
 end if;
 if c.last_commit=p_commit then return c.revision; end if;
 if c.revision<>p_revision then raise exception 'Concurrent database revision' using errcode='40001'; end if;
 for t,rows in select * from jsonb_each(p_upserts) loop
  if not(t=any(allowed)) then raise exception 'Invalid table'; end if;
  execute format('insert into public.%I(id,payload) select key,value from jsonb_each($1) on conflict(id) do update set payload=excluded.payload',t) using rows;
 end loop;
 for t,rows in select * from jsonb_each(p_deletes) loop
  if not(t=any(allowed)) then raise exception 'Invalid table'; end if;
  execute format('delete from public.%I where id in (select jsonb_array_elements_text($1))',t) using rows;
 end loop;
 update gm_control set revision=revision+1,last_commit=p_commit,initialized=true,
  lease_until=now()+interval '90 seconds',updated_at=now() where id=true returning revision into p_revision;
 return p_revision;
end $$;
create or replace function public.gm_heartbeat(p_writer text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update gm_control set lease_until=now()+interval '90 seconds' where id=true and writer=p_writer and lease_until>now();
 return found;
end $$;
create or replace function public.gm_release(p_writer text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update gm_control set writer=null,lease_until=null where id=true and writer=p_writer;
$$;
create or replace function public.gm_ping() returns bigint
language sql security definer set search_path=public,pg_temp as $$ select revision from gm_control where id=true $$;
revoke all on function public.gm_snapshot(text,boolean),public.gm_commit(text,bigint,text,jsonb,jsonb),public.gm_heartbeat(text),public.gm_release(text),public.gm_ping() from public,anon,authenticated;
grant execute on function public.gm_snapshot(text,boolean),public.gm_commit(text,bigint,text,jsonb,jsonb),public.gm_heartbeat(text),public.gm_release(text),public.gm_ping() to service_role;

-- Private bucket: no client policies, no signed public URLs in the database.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gm-media','gm-media',false,2097152,array['image/webp','image/jpeg','image/png','audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;
