-- ISOLATED DB ONLY. Two psql sessions with the SAME authorized test fixture.
-- Supply BEMMAIS_ISOLATED_TEST=on, actor, store, listing, variant, slug, mode.
-- mode=holder locks the listing for editing; mode=buyer calls real checkout.
-- A holds its transaction at the prompt; run B before committing A.
-- B MUST raise CHECKOUT_CONCURRENT_CHANGE, with zero order/reservation inserts.
-- Then rollback A and repeat B: success. Repeat the same key: same order/reserve.
-- To test the last unit: seed available=1 in the isolated fixture, start two
-- buyer sessions with different keys, qty=1. Only one may commit; the other
-- must raise INSUFFICIENT_STOCK. Verify the ledger, then reset the fixture.
-- Never use a production URL or production identifiers.
\if :{?BEMMAIS_ISOLATED_TEST}
\if :BEMMAIS_ISOLATED_TEST
\else
\quit 3
\endif
\else
\quit 3
\endif
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', :'actor', true);
SELECT :'mode' = 'holder' AS hold_mode \gset
\if :hold_mode
SELECT id FROM public.store_listings WHERE id=:'listing'::uuid FOR UPDATE;
\prompt 'Run buyer session now; press Enter to rollback holder: ' continue
ROLLBACK;
\else
SET LOCAL ROLE authenticated;
SELECT public.create_storefront_order(:'slug',
 jsonb_build_array(jsonb_build_object('listingId',:'listing','variantId',:'variant','quantity',1)),
 '{"recipient":"Isolated recipient","postal_code":"01001000","street":"Test street","number":"1","district":"Test district","city":"Test city","state":"SP","country":"BR"}',
 :'key');
COMMIT;
\endif
