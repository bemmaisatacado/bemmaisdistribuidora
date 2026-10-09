-- ISOLATED DATABASE ONLY. Apply migrations there first. Never run against production.
-- This script exercises validators only; lifecycle/RLS/concurrency need authenticated fixtures.
BEGIN;
DO $$
DECLARE a jsonb := '{"recipient":"Destinatário","postal_code":"01001-000","street":"Praça da Sé","number":"1","district":"Sé","city":"São Paulo","state":"sp","country":"br"}'; n jsonb;
BEGIN
 n:=public.normalize_delivery_address(a);
 IF NOT public.shipping_address_complete(n) THEN RAISE EXCEPTION 'VALID_ADDRESS_FAILED'; END IF;
 IF public.shipping_address_complete(n || '{"state":"ZZ"}') THEN RAISE EXCEPTION 'INVALID_UF_ACCEPTED'; END IF;
 IF public.shipping_address_complete(n-'district') THEN RAISE EXCEPTION 'MISSING_FIELD_ACCEPTED'; END IF;
 IF NOT public.shipping_address_complete((n-'number') || '{"no_number":"true"}') THEN RAISE EXCEPTION 'NO_NUMBER_FAILED'; END IF;
 IF public.normalize_delivery_address('{"delivery_method":"pickup"}') <> '{"delivery_method":"pickup"}'::jsonb THEN RAISE EXCEPTION 'PICKUP_FAILED'; END IF;
END $$;
ROLLBACK;
