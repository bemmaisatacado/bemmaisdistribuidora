import { deliveryAddressComplete } from "./address.ts";
export const CHECKOUT_ERROR_CODES = [
  "CHECKOUT_AUTH_REQUIRED",
  "STORE_UNAVAILABLE",
  "EMPTY_CART",
  "INVALID_ITEM",
  "LISTING_UNAVAILABLE",
  "INVALID_VARIANT",
  "VARIANT_INACTIVE",
  "OFFER_UNAVAILABLE",
  "INVALID_MODALITY",
  "MOQ_NOT_MET",
  "PRICE_UNAVAILABLE",
  "INCOMPATIBLE_ITEM",
  "INVENTORY_UNAVAILABLE",
  "INSUFFICIENT_STOCK",
  "STOCK_POSITION_INVALID",
  "STOCK_RESERVATION_CONFLICT",
  "RESERVATION_ALREADY_RELEASED",
  "IDEMPOTENCY_CONFLICT",
  "ADDRESS_INCOMPLETE",
  "PICKUP_UNAVAILABLE",
] as const;
export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[number];
export type CheckoutIntentItem = {
  listingId: string;
  variantId: string;
  quantity: number;
  modality?: string | null;
};
export type CheckoutIntent = {
  storeSlug: string;
  items: CheckoutIntentItem[];
  shippingAddress: Record<string, string>;
  idempotencyKey: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const checkoutIntentError = (intent: CheckoutIntent): CheckoutErrorCode | null => {
  if (!intent.storeSlug.trim() || !intent.idempotencyKey.trim()) return "INVALID_ITEM";
  if (
    intent.shippingAddress.delivery_method &&
    !["delivery", "pickup"].includes(intent.shippingAddress.delivery_method)
  )
    return "ADDRESS_INCOMPLETE";
  if (
    intent.shippingAddress.delivery_method !== "pickup" &&
    !deliveryAddressComplete(intent.shippingAddress)
  )
    return "ADDRESS_INCOMPLETE";
  if (!intent.items.length) return "EMPTY_CART";
  const seen = new Set<string>();
  for (const item of intent.items) {
    const key = `${item.listingId}:${item.variantId}`;
    if (
      !uuid.test(item.listingId) ||
      !uuid.test(item.variantId) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 999 ||
      seen.has(key)
    )
      return "INVALID_ITEM";
    seen.add(key);
  }
  return null;
};
export const checkoutErrorMessage = (code: string) =>
  (
    ({
      CHECKOUT_AUTH_REQUIRED: "Entre na sua conta para concluir o pedido.",
      STORE_UNAVAILABLE: "Esta loja não está disponível para checkout.",
      EMPTY_CART: "Seu carrinho está vazio.",
      LISTING_UNAVAILABLE: "Um item não está mais disponível.",
      INVALID_VARIANT: "Uma variante do pedido é inválida.",
      VARIANT_INACTIVE: "Uma variante não está ativa.",
      OFFER_UNAVAILABLE: "A oferta deste item não está disponível.",
      INVALID_MODALITY: "A modalidade comercial escolhida não é válida.",
      MOQ_NOT_MET: "A quantidade mínima da oferta não foi atendida.",
      PRICE_UNAVAILABLE: "Não foi possível resolver o preço atual.",
      INCOMPATIBLE_ITEM: "Um item não corresponde à loja ou à oferta.",
      INVENTORY_UNAVAILABLE: "A disponibilidade atual não atende a quantidade solicitada.",
      INSUFFICIENT_STOCK: "A disponibilidade atual não atende a quantidade solicitada.",
      STOCK_POSITION_INVALID: "A posição de estoque deste item não está disponível.",
      STOCK_RESERVATION_CONFLICT: "Não foi possível reservar o estoque deste item.",
      RESERVATION_ALREADY_RELEASED: "A reserva deste item já foi liberada.",
      IDEMPOTENCY_CONFLICT: "Não foi possível confirmar esta tentativa de checkout.",
      ADDRESS_INCOMPLETE: "Preencha o endereço completo, com CEP e UF válidos.",
      PICKUP_UNAVAILABLE: "Esta loja ainda não oferece retirada.",
      CHECKOUT_CONCURRENT_CHANGE:
        "Um item está sendo atualizado. Tente novamente com a mesma tentativa.",
    }) as Record<string, string>
  )[code] ?? "Não foi possível concluir o pedido agora.";
