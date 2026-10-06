export type StockLockKey = {
  stockOwnerId: string;
  variantId: string;
};

export type StockReservationLine = StockLockKey & {
  quantity: number;
  stockControlled: boolean;
};

export type ReservationStatus = "reserved" | "released" | "not_controlled";

const lockIdentity = ({ stockOwnerId, variantId }: StockLockKey) =>
  `${stockOwnerId.toLowerCase()}:${variantId.toLowerCase()}`;

/** Mirrors the database lock order: owner first, then SKU/variant. */
export const orderedStockLocks = (lines: readonly StockReservationLine[]): StockLockKey[] =>
  [...new Map(lines.map((line) => [lockIdentity(line), line])).values()]
    .map(({ stockOwnerId, variantId }) => ({ stockOwnerId, variantId }))
    .sort((left, right) => lockIdentity(left).localeCompare(lockIdentity(right)));

export const requestedStockByPosition = (lines: readonly StockReservationLine[]) => {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.stockControlled) continue;
    const key = lockIdentity(line);
    totals.set(key, (totals.get(key) ?? 0) + line.quantity);
  }
  return totals;
};

export const reservationError = ({
  onHand,
  reserved,
  requested,
}: {
  onHand: number;
  reserved: number;
  requested: number;
}): "INSUFFICIENT_STOCK" | null =>
  !Number.isInteger(onHand) ||
  !Number.isInteger(reserved) ||
  !Number.isInteger(requested) ||
  requested < 1 ||
  onHand - reserved < requested
    ? "INSUFFICIENT_STOCK"
    : null;

export const reservationStatus = ({
  hasReservation,
  hasRelease,
}: {
  hasReservation: boolean;
  hasRelease: boolean;
}): ReservationStatus =>
  !hasReservation ? "not_controlled" : hasRelease ? "released" : "reserved";
