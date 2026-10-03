-- Smart Reader: Supabase schema, RLS and storage policies.
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.books (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  author text,
  cover_url text,          -- storage path inside the `covers` bucket
  file_path text not null, -- storage path inside the `books` bucket
  format text not null default 'epub',
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_progress (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  location jsonb not null default '{}',
  progress_percent real not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create table if not exists public.vocabulary (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  word text not null,
  context text not null default '',
  meaning text,
  location jsonb not null default '{}',
  chapter_label text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_passages (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  title text not null,
  text text not null,
  location jsonb not null default '{}',
  chapter_label text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  title text not null default '',
  content text not null default '',
  location jsonb not null default '{}',
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_user_updated on public.books (user_id, updated_at);
create index if not exists progress_user_updated on public.reading_progress (user_id, updated_at);
create index if not exists vocab_user_updated on public.vocabulary (user_id, updated_at);
create index if not exists passages_user_updated on public.saved_passages (user_id, updated_at);
create index if not exists notes_user_updated on public.notes (user_id, updated_at);

-- Row Level Security: every row is private to its owner.
do $$
declare t text;
begin
  foreach t in array array['books','reading_progress','vocabulary','saved_passages','notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s owner" on public.%1$I', t);
    execute format(
      'create policy "%1$s owner" on public.%1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- Storage: private buckets, files live under "<user_id>/..."
insert into storage.buckets (id, name, public) values ('books', 'books', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('covers', 'covers', false) on conflict do nothing;

do $$
declare b text;
begin
  foreach b in array array['books','covers'] loop
    execute format('drop policy if exists "%s owner access" on storage.objects', b);
    execute format(
      'create policy "%1$s owner access" on storage.objects for all to authenticated
         using (bucket_id = %2$L and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = %2$L and (storage.foldername(name))[1] = auth.uid()::text)',
      b, b
    );
  end loop;
end $$;
