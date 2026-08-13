-- 0012 — the progress-photo bucket.
--
-- `progress_photos` (migration 0004) has always stored the path; this is the
-- bucket that path points into. It is separate from the table migration
-- because a bucket is infrastructure with its own access model, and getting
-- that model wrong is the difference between a private photo and a public one.
--
-- Three decisions worth stating:
--
--   The bucket is PRIVATE. Progress photos are the most sensitive thing this
--   app will ever hold. Nothing is served from a public URL; the app asks for a
--   short-lived signed URL each time it needs to render one, so a leaked link
--   expires instead of standing open forever.
--
--   Ownership is the FIRST PATH SEGMENT. Objects live at `<user_id>/<file>`,
--   and every policy compares that segment to auth.uid(). This is the storage
--   equivalent of the is_owner(user_id) predicate used on ordinary tables — the
--   path is not a naming convention, it is the authorisation key.
--
--   Uploads are CONSTRAINED at the bucket. A MIME allow-list and a size ceiling
--   are enforced by storage itself, not by the client that happens to be
--   asking. A client check is a courtesy to the user; this is the actual limit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  15728640, -- 15 MB; comfortably above a phone photo, far below a video.
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- RLS on storage.objects is already enabled by Supabase. With no policy for
-- this bucket, everything is denied — which is the intended default, and why
-- each verb below is granted explicitly and narrowly.

drop policy if exists progress_photos_read on storage.objects;
create policy progress_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists progress_photos_insert on storage.objects;
create policy progress_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Deliberately no UPDATE policy. A progress photo is a record of a moment, like
-- an unlocked achievement: replacing the image behind an existing row would
-- make the timeline quietly untrue. Photos can be added and deleted, not edited.

drop policy if exists progress_photos_delete on storage.objects;
create policy progress_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- Row-level columns the upload flow needs
-- ---------------------------------------------------------------------------
-- `pose` existed as free text. The app only ever writes one of four values and
-- groups the gallery by them, so an unconstrained column would let a typo
-- create a fifth category nobody can see. `note` and `weight_kg` are new: the
-- weight is a snapshot taken at upload time, not a join, because the point of a
-- photo is what the scale said *that day* even if the log is later corrected.

alter table public.progress_photos
  add column if not exists note      text,
  add column if not exists weight_kg numeric(5,2);

alter table public.progress_photos
  drop constraint if exists progress_photos_pose_known;
alter table public.progress_photos
  add constraint progress_photos_pose_known
  check (pose is null or pose in ('front', 'side', 'back', 'other'));

alter table public.progress_photos
  drop constraint if exists progress_photos_weight_plausible;
alter table public.progress_photos
  add constraint progress_photos_weight_plausible
  check (weight_kg is null or (weight_kg >= 25 and weight_kg <= 400));

-- One row per photo, and the path is unique per user: re-running an upload that
-- already succeeded cannot create a second row pointing at the same object.
create unique index if not exists progress_photos_user_path
  on public.progress_photos (user_id, storage_path);
