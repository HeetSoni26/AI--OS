-- Part 3 logo hardening: route-level and bucket policy must agree.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
WHERE id = 'client-logos';
