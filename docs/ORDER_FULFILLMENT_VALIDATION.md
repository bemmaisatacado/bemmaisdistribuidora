# Bloco 7 — operational fulfillment and physical stock consumption

Implemented in code; NOT homologated in PostgreSQL. No remote migration applied.
The Supabase/Postgres skills guided explicit RLS/grants and deterministic locks.

## Real domain and owner resolution

There was no fulfillment table, only the coarse order item enum:
unassigned / pending / fulfilled / cancelled. New order_fulfillments stores operational
groups with ready_to_pick → picking → packed → ready_to_ship. No shipped/delivered
state or transport/tracking event is fabricated. Order items remain pending until
the future shipping workflow; the Central's existing server-side pending indicator
therefore remains coherent. No extra metrics/filter redesign is necessary.

Checkout already reserves controlled positions, but leaves fulfillment owner NULL.
Start resolves the existing supplier_profiles.fulfillment_mode in SQL: supplier
uses that supplier; bemmais resolves the organization with is_platform=true.
Existing explicit historical owner takes precedence. Platform-owned stock without
a supplier resolves to the platform itself. third_party without an explicit owner,
or missing supplier configuration, is blocked. No browser selects owners.
The operational owner is captured on the item once; later profile changes do not
reassign an existing group. Group identity includes fulfillment owner, stock owner,
supplier and seller. Each complete item is linked once, without duplicated quantities.
No partial quantities, operational cancellation, shipment or delivery are supported.

## Payment gate and concurrency design

Each operation requires platform admin and a paid, non-cancelled order, exactly one
paid Payment matching buyer/org/amount/currency, and a processed verified paid event
matching provider and amount/currency. Other open/uncertain/refund/chargeback attempts
block operation. No manual payment approval or real gateway is introduced.

Locks: order → payments sorted by ID → items sorted by ID → fulfillment row →
controlled stock positions sorted by owner/variant (same advisory key as checkout).
Start additionally reads supplier profile configuration FOR SHARE. Cancellation and
payment confirmation share the order-first lock. No platform-wide stock lock.
One group transition is one transaction. Another group's previously committed
physical operation is independent and is NOT silently reversed on failure.

## Immutable stock semantics

Only explicit packed → ready_to_ship confirms full physical removal of every item
in that group. reserve itself never reduces on_hand. Consumption appends release
(existing inventory_reservation_release reference) followed by out referencing the
original reservation as inventory_reservation_consumption. The existing view and
balance guard remain authoritative: on_hand - q, reserved - q, available unchanged.
Release is inserted first so the balance guard never sees a double reduction.
Both movements and lifecycle/audit changes roll back if ANY item fails.
Unique output per original reservation + existing unique release index prevent
double consumption. State-based retries return idempotent success without another
movement. Released/mismatched/negative legacy positions block; no auto repair.
No reservation means uncontrolled under the existing checkout rule: no fake output
or balance is created, even if a stock position is created after that purchase.
Snapshots, prices, quantities and order totals are untouched. Items are immutable
after grouping. Existing cancellation cannot cancel paid/executing orders; an extra
guard rejects cancellation of any order having operational groups. Consumed stock
cannot be released again; future returns require their own authorized workflow.

## Validation evidence and pending runtime tests

Node tests validate pure lifecycle, DTO/caller, grouping and arithmetic, plus explicitly
labeled static SQL/UI contracts. They DO NOT prove SQL compilation, transaction rollback,
RLS or concurrency. No isolated PostgreSQL/psql/Docker/Deno was available in this run;
nothing was installed. tests/sql/order-fulfillment.sql is an unexecuted disposable local
fixture (BEGIN/ROLLBACK), exercising real RPCs, verified payment fixture, owner separation,
retry, invalid transitions, released reservation, group rollback, uncontrolled items,
balances, preserved snapshots, cancellation gate and audit. Production is prohibited.

Before activation apply migrations in order ONLY to an authorized isolated Supabase,
run payment-hardening, order-cancellation and order-fulfillment SQL suites. Also execute:

- Two sessions, same packed group: simultaneous packed → ready_to_ship. Exactly one
  consumption pair per reservation, one transition, second idempotent result.
- Two groups sharing owner/SKU: simultaneous consumption; deterministic locks, valid
  reserved and on_hand, no cross-owner movement or available double reduction.
- Inject failure after an earlier item/output in a multi-item group: rollback all group
  outputs/releases, status and audit. Repeat for invalid/missing/mismatched reservation.
- Race payment-state changes / cancellation / release against consumption. No unpaid
  operation or release after output; paid confirmation cannot be forged by an admin.
- RLS: anonymous, buyer and supplier cannot operate/write groups; only platform admin
  can read and call operational RPCs. Check direct DML is rejected.
- Previously consumed reserve, duplicate insertion, uncertain/mismatched Payment,
  cancelled order, and legacy negative balances must reject safely.
- Browser QA Order 360: context-only buttons, confirmation, loading, error/refetch,
  real owner/stock state/activity and Central refresh. Integrated QA remains pending.

Bloco 5.2 pending documentation, SQL and runner are preserved byte-for-byte.
