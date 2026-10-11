-- Apply only through the Supabase migration pipeline after the Prisma baseline.
-- Every operational bucket is private. Application code issues short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('client-files', 'client-files', false, 104857600),
  ('client-logos', 'client-logos', false, 104857600),
  ('receipts', 'receipts', false, 104857600),
  ('templates', 'templates', false, 104857600),
  ('media', 'media', false, 104857600),
  ('chatbot-sources', 'chatbot-sources', false, 104857600),
  ('exports', 'exports', false, 104857600),
  ('reports', 'reports', false, 104857600)
ON CONFLICT (id) DO UPDATE
SET public = excluded.public, file_size_limit = excluded.file_size_limit;

CREATE OR REPLACE FUNCTION public.aios_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.owner_accounts
    WHERE auth_subject = auth.uid() AND active
  );
$function$;

REVOKE ALL ON FUNCTION public.aios_is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aios_is_owner() TO authenticated, service_role;

DROP POLICY IF EXISTS "aios owner reads private objects" ON storage.objects;
CREATE POLICY "aios owner reads private objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  public.aios_is_owner()
  AND bucket_id IN ('client-files', 'client-logos', 'receipts', 'templates', 'media', 'chatbot-sources', 'exports', 'reports')
);

DROP POLICY IF EXISTS "aios owner creates private objects" ON storage.objects;
CREATE POLICY "aios owner creates private objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  public.aios_is_owner()
  AND bucket_id IN ('client-files', 'client-logos', 'receipts', 'templates', 'media', 'chatbot-sources', 'exports', 'reports')
);

DROP POLICY IF EXISTS "aios owner updates private objects" ON storage.objects;
CREATE POLICY "aios owner updates private objects"
ON storage.objects FOR UPDATE TO authenticated
USING (
  public.aios_is_owner()
  AND bucket_id IN ('client-files', 'client-logos', 'receipts', 'templates', 'media', 'chatbot-sources', 'exports', 'reports')
)
WITH CHECK (
  public.aios_is_owner()
  AND bucket_id IN ('client-files', 'client-logos', 'receipts', 'templates', 'media', 'chatbot-sources', 'exports', 'reports')
);

DROP POLICY IF EXISTS "aios owner deletes private objects" ON storage.objects;
CREATE POLICY "aios owner deletes private objects"
ON storage.objects FOR DELETE TO authenticated
USING (
  public.aios_is_owner()
  AND bucket_id IN ('client-files', 'client-logos', 'receipts', 'templates', 'media', 'chatbot-sources', 'exports', 'reports')
);
