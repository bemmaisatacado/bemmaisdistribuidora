REVOKE EXECUTE ON FUNCTION public.guard_review_status() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_platform_price(uuid, commercial_modality, uuid) FROM anon;