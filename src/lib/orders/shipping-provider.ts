// Backend adapter contract only. No provider is registered and no API is called.
import type { PackageIntent, ShippingAddress } from "./logistics";
export interface ShippingProviderAdapter {
  readonly providerKey: string;
  quote(input: {
    shipmentId: string;
    origin: ShippingAddress;
    recipient: ShippingAddress;
    packages: readonly PackageIntent[];
  }): Promise<
    readonly {
      providerQuoteId: string;
      serviceName: string;
      amountMinor: bigint;
      currency: string;
      estimatedBusinessDays: number | null;
    }[]
  >;
  purchaseLabel(input: {
    shipmentId: string;
    providerQuoteId: string;
    idempotencyKey: string;
  }): Promise<{ providerLabelId: string }>;
  cancelLabel(input: { providerLabelId: string; idempotencyKey: string }): Promise<void>;
  fetchTracking(input: {
    providerShipmentId: string;
  }): Promise<
    readonly { eventId: string; occurredAt: string; status: string; description: string }[]
  >;
}
export function requireShippingProvider(
  adapter?: ShippingProviderAdapter,
): ShippingProviderAdapter {
  if (!adapter) throw new Error("PROVIDER_NOT_CONFIGURED");
  return adapter;
}
