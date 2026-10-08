import type { PaymentMethod, PaymentStatus } from "./foundation";

export type PaymentProviderCreateInput = {
  paymentId: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
};

export type VerifiedProviderEvent = {
  provider: string;
  providerEventId: string;
  eventType: string;
  paymentId: string;
  status: PaymentStatus;
  providerPaymentId: string;
  amount: string;
  currency: string;
  failureCode: string | null;
  metadata: Record<string, unknown>;
};

/** A real adapter must verify its webhook before returning an event to the payment core. */
export interface PaymentProviderAdapter {
  createPayment(input: PaymentProviderCreateInput): Promise<{ providerPaymentId: string }>;
  getPayment(providerPaymentId: string): Promise<{ status: PaymentStatus }>;
  cancelPayment(providerPaymentId: string): Promise<void>;
  verifyWebhook(input: {
    headers: Record<string, string>;
    body: string;
  }): Promise<VerifiedProviderEvent>;
}
