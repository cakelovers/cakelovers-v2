-- ============================================================================
-- 0009_storage_buckets.sql — private storage buckets for uploaded images
-- ============================================================================
-- Nothing in this codebase creates these buckets at runtime — every route
-- that touches them (catalog-designs, ai-preview/save,
-- reference-images/save, and the admin equivalents) assumes they already
-- exist and will fail with a storage "bucket not found" error otherwise.
-- All three are private (public = false): every read goes through a
-- service-role-issued signed URL, never a public bucket URL — same
-- convention as the rest of this schema's public/customer-facing reads.
--
-- SAFE TO RE-RUN: on conflict do nothing.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog-designs', 'catalog-designs', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']),
  ('ai-previews', 'ai-previews', false, 8388608, array['image/png', 'image/jpeg']),
  ('reference-images', 'reference-images', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
