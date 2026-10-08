# Payment hardening validation

No remote migrations or SQL tests were run. Local `psql`, PostgreSQL server and
Docker were unavailable during implementation. Node tests do not certify DB
atomicity, constraints, trigger behavior or simultaneous events.

On a disposable local Supabase, install migrations in order, then run:

```sh
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/payment-hardening.sql
```

The script rolls back fixtures and checks persistent idempotency, method conflict,
unverified confirmation rejection, amount binding, event repetition, non-regression,
one paid payment/order, rollback and unchanged reservation ledger. It has not been
executed here. Fixtures are test-only and never register a production provider.

Concurrency additionally needs two independent PostgreSQL connections: create a
local pending order and two backend-bound payments, then concurrently call
`confirm_verified_payment_event` with distinct event IDs targeting that order.
For two paid events on different payments only one may succeed. For paid followed
by processing on the same payment, the late processing event must fail without
regression. Repeat the same provider event simultaneously: exactly one event row
must exist. Verify payment/order audit entries and that the inventory ledger is
unchanged. These concurrent scenarios remain unexecuted.

The old admin confirmation RPC has no execute grants. The new RPC is service-only,
checks provider payment binding and amount/currency, locks order before payment,
and commits event/payment/order together. No deployed verifier is registered: the
Edge Function returns `PAYMENT_PROVIDER_UNAVAILABLE`. A real adapter must implement
provider authenticity and timestamp/replay validation before registration, and
bind the provider payment ID server-side. Secrets stay in backend environment.

Creation intentionally returns unavailability while no gateway is enabled. Existing
keys still return the existing payment only if buyer/order/method/amount/currency
match. A global unique key index aborts installation if legacy duplicates exist;
review those records without rewriting payment history before activation.
