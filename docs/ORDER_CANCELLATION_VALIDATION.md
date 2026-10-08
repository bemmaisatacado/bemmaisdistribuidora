# Bloco 6 — operational cancellation

Only platform admins may cancel draft/pending_payment orders. No open payment is
considered safe: pending, processing, authorized, paid, refund/chargeback states,
financial allocations or linked financial ledger block cancellation. Failed,
expired and cancelled attempts are terminal and compatible with cancellation.
Pending/fulfilled items and linked outbound inventory movements also block it.
No refund, provider cancellation, fulfillment or stock exit is implemented.

`cancel_order` locks order → payments by ID → items by ID → stock positions sorted
by organization/variant. Payment creation/confirmation already lock that order;
existing financial allocation/ledger inserts linked to the order share its lock
via guard triggers and reject cancelled orders. This is a safety gate only, not
an implementation of split, payout or financial allocation workflows.
Existing reserve/release unique indexes and append-only ledger are reused.
Existing release RPC now requires admin, an operationally cancelled order and the
same financial gates (legacy cancelled records cannot bypass this check). It uses
order-first locking too. The cancel operation
sets the order cancelled before invoking releases INSIDE the same transaction;
failure of any release rolls back order, items, all releases and audit records.
Uncontrolled items have no reservation and no stock movement is manufactured.
Same order/reason retries return idempotent success without rewriting cancellation
metadata; a different reason conflicts. Legacy cancelled orders require review.
Expected status protects stale admin screens. Cancellation actor/time/reason are
explicit fields captured by the existing audit trigger, not a parallel log.

SQL/runtime validations have NOT been executed: no local PostgreSQL/Docker runtime.
Node helper/caller tests do NOT certify locking, atomicity, RLS or SQL syntax.
The Bloco 5.2 files are intentionally unchanged. Use an authorized disposable local
Supabase with migrations applied in order to execute tests/sql/order-cancellation.sql.

Concurrency checks additionally need two real sessions: simultaneously cancel
the same order/reason (one update, one idempotent response, one release per reserve);
cancel with different reasons (one success, one intent conflict); and race a pending
payment's paid confirmation against cancellation (cancellation must be blocked while
the payment is pending, paid wins if valid). Verify no paid/cancelled combination.
Race release retries using multiple owner/SKU positions: no duplicate releases,
no negative reserved and unchanged on_hand. These scenarios remain pending.

UI: backend context drives action visibility; confirmation dialog requires reason,
blocks resubmission, reports safe errors and refreshes order/audit/reservation data.
Central is invalidated after success. Browser integrated QA remains pending.
