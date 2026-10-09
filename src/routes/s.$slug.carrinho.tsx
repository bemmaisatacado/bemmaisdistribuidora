import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  readCart,
  writeCart,
  changeCartQuantity,
  cartTotal,
  type PersistedCart,
} from "@/lib/store-cart";
import { formatStorePrice } from "@/lib/storefront";
import { checkoutErrorMessage } from "@/lib/orders/checkout";
import {
  deliveryAddressComplete,
  normalizeDeliveryAddress,
  emptyDeliveryAddress,
  type DeliveryAddress,
} from "@/lib/orders/address";
import { DeliveryAddressForm } from "@/components/delivery-address-form";
import { startOrderPayment, type PaymentRpcClient } from "@/lib/payments/client";
import type { PaymentMethod } from "@/lib/payments/foundation";
export const Route = createFileRoute("/s/$slug/carrinho")({ component: Cart });
const cartRpc = supabase as unknown as {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};
type Validation = {
  items: {
    listing_id: string;
    variant_id: string;
    unit_price: number;
    accepted_quantity: number;
    available: boolean;
  }[];
};
function Cart() {
  const { slug } = Route.useParams();
  const [cart, setCart] = useState<PersistedCart>({ storeSlug: slug, items: [] });
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [address, setAddress] = useState<DeliveryAddress>(emptyDeliveryAddress);
  const [deliveryMethod, setDeliveryMethod] = useState("delivery");
  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutKey] = useState(() => crypto.randomUUID());
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [paymentKey] = useState(() => crypto.randomUUID());
  const [startingPayment, setStartingPayment] = useState(false);
  const startPayment = async () => {
    if (!createdOrderId || startingPayment) return;
    setStartingPayment(true);
    try {
      const result = await startOrderPayment(supabase as unknown as PaymentRpcClient, {
        orderId: createdOrderId,
        method: paymentMethod,
        idempotencyKey: paymentKey,
      });
      setNotice(result.message);
    } catch {
      setNotice("Não foi possível consultar o pagamento agora.");
    } finally {
      setStartingPayment(false);
    }
  };
  const update = (c: PersistedCart) => {
    setCart(c);
    writeCart(c);
  };
  const validate = useCallback(
    async (current: PersistedCart) => {
      if (!current.items.length) return;
      setChecking(true);
      const { data, error } = await cartRpc.rpc("validate_storefront_cart", {
        _slug: slug,
        _items: current.items.map((i) => ({
          listingId: i.listingId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      });
      setChecking(false);
      if (error) {
        setNotice("Não foi possível atualizar a disponibilidade agora.");
        return;
      }
      const valid = (data as unknown as Validation).items;
      const next = {
        ...current,
        items: current.items.flatMap((item) => {
          const checked = valid.find(
            (v) => v.listing_id === item.listingId && v.variant_id === item.variantId,
          );
          if (!checked || !checked.available || checked.accepted_quantity < 1) return [];
          return [
            {
              ...item,
              price: Number(checked.unit_price),
              quantity: checked.accepted_quantity,
              available: checked.accepted_quantity,
            },
          ];
        }),
      };
      if (
        next.items.length !== current.items.length ||
        next.items.some(
          (x, i) =>
            x.price !== current.items[i]?.price || x.quantity !== current.items[i]?.quantity,
        )
      )
        setNotice("Carrinho atualizado conforme preço e disponibilidade atuais.");
      update(next);
    },
    [slug],
  );
  useEffect(() => {
    let active = true;
    void cartRpc.rpc("storefront_delivery_options", { _slug: slug }).then(({ data }) => {
      if (active)
        setPickupAvailable(
          typeof data === "object" && data !== null && "pickup" in data && data.pickup === true,
        );
    });
    const initial = readCart(slug);
    setCart(initial);
    void validate(initial);
    return () => {
      active = false;
    };
  }, [slug, validate]);
  const checkout = async () => {
    if (!cart.items.length || submitting) return;
    if (deliveryMethod === "delivery" && !deliveryAddressComplete(address)) {
      setNotice(checkoutErrorMessage("ADDRESS_INCOMPLETE"));
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setNotice(checkoutErrorMessage("CHECKOUT_AUTH_REQUIRED"));
        setSubmitting(false);
        return;
      }
      const { data, error } = await cartRpc.rpc("create_storefront_order", {
        _store_slug: slug,
        _items: cart.items.map((item) => ({
          listingId: item.listingId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        _shipping_address:
          deliveryMethod === "pickup"
            ? { delivery_method: "pickup" }
            : { ...normalizeDeliveryAddress(address), delivery_method: "delivery" },
        _idempotency_key: checkoutKey,
      });
      setSubmitting(false);
      if (error) {
        setNotice(checkoutErrorMessage(error.message));
        return;
      }
      const orderId =
        typeof data === "object" &&
        data !== null &&
        "order_id" in data &&
        typeof data.order_id === "string"
          ? data.order_id
          : null;
      if (!orderId) {
        setNotice(checkoutErrorMessage("IDEMPOTENCY_CONFLICT"));
        return;
      }
      update({ storeSlug: slug, items: [] });
      setCreatedOrderId(orderId);
      setNotice(`Pedido criado com sucesso: ${orderId}. O pagamento ainda não foi registrado.`);
    } catch {
      setNotice(
        "Falha de conexão. Seus dados foram preservados; tente novamente com a mesma tentativa.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white px-5 py-10">
      <Link
        to="/s/$slug/catalogo"
        params={{ slug }}
        search={{ preview: undefined }}
        className="text-sm text-slate-500"
      >
        ← Continuar comprando
      </Link>
      <div className="mt-6 flex items-end justify-between">
        <h1 className="text-3xl font-bold">Seu carrinho</h1>
        {checking ? (
          <span className="text-xs text-slate-500">Validando disponibilidade…</span>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {notice}
        </p>
      ) : null}
      {createdOrderId && (
        <section aria-label="Pagamento do pedido" className="mt-5 rounded-lg border p-4">
          <h2 className="font-bold">Pagamento do pedido</h2>
          <p className="mt-2 text-sm text-slate-600">
            Pagamento online ainda indisponível. Nenhuma cobrança foi emitida; seu pedido aguarda
            pagamento.
          </p>
          <label className="mt-3 block text-sm">
            Método desejado para consultar disponibilidade
            <select
              value={paymentMethod}
              onChange={(event) => {
                if (event.target.value === "pix" || event.target.value === "card")
                  setPaymentMethod(event.target.value);
              }}
              className="ml-2 rounded border p-2"
            >
              <option value="pix">Pix</option>
              <option value="card">Cartão</option>
            </select>
          </label>
          <button
            onClick={() => void startPayment()}
            disabled={startingPayment}
            className="mt-3 rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
          >
            {startingPayment ? "Consultando…" : "Consultar disponibilidade de pagamento"}
          </button>
        </section>
      )}
      {!cart.items.length ? (
        <p className="mt-5 text-slate-500">Seu carrinho está vazio.</p>
      ) : (
        <>
          <div className="mt-6 divide-y">
            {cart.items.map((i) => (
              <div className="flex items-center justify-between gap-4 py-4" key={i.key}>
                <div>
                  <b>{i.name}</b>
                  {i.sku ? <p className="text-xs text-slate-500">SKU {i.sku}</p> : null}
                  <p>{formatStorePrice(i.price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Diminuir quantidade"
                    onClick={() =>
                      update({
                        ...cart,
                        items: changeCartQuantity(cart.items, i.key, i.quantity - 1),
                      })
                    }
                    className="rounded border px-2"
                  >
                    −
                  </button>
                  <span>{i.quantity}</span>
                  <button
                    aria-label="Aumentar quantidade"
                    onClick={() =>
                      update({
                        ...cart,
                        items: changeCartQuantity(cart.items, i.key, i.quantity + 1),
                      })
                    }
                    className="rounded border px-2"
                  >
                    +
                  </button>
                  <button
                    className="ml-2 text-sm text-red-600"
                    onClick={() =>
                      update({ ...cart, items: changeCartQuantity(cart.items, i.key, 0) })
                    }
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between border-t pt-5 text-xl font-bold">
            <span>Total</span>
            <span>{formatStorePrice(cartTotal(cart.items))}</span>
          </div>
          <button
            onClick={() => void validate(cart)}
            className="mt-5 w-full rounded-lg bg-black px-5 py-3 font-semibold text-white"
          >
            Atualizar carrinho
          </button>
          <div className="mt-5 grid gap-3 rounded-lg border p-4">
            {pickupAvailable && (
              <label>
                Recebimento
                <select
                  value={deliveryMethod}
                  onChange={(e) => setDeliveryMethod(e.target.value)}
                  className="ml-2 rounded border p-3"
                >
                  <option value="delivery">Entrega</option>
                  <option value="pickup">Retirada</option>
                </select>
              </label>
            )}
            {deliveryMethod === "delivery" ? (
              <DeliveryAddressForm value={address} onChange={setAddress} />
            ) : (
              <p>Retirada selecionada. Não é necessário endereço de entrega.</p>
            )}
            <button
              onClick={() => void checkout()}
              disabled={submitting}
              className="rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Criando pedido…" : "Criar pedido"}
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            O pagamento será disponibilizado em etapa posterior.
          </p>
        </>
      )}
    </main>
  );
}
