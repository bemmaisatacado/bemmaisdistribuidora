import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  readCart,
  writeCart,
  changeCartQuantity,
  cartTotal,
  type PersistedCart,
} from "@/lib/store-cart";
import { money } from "@/components/storefront/ProductCard";
export const Route = createFileRoute("/s/$slug/carrinho")({ component: Cart });
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
  const update = (c: PersistedCart) => {
    setCart(c);
    writeCart(c);
  };
  const validate = async (current: PersistedCart) => {
    if (!current.items.length) return;
    setChecking(true);
    const { data, error } = await supabase.rpc("validate_storefront_cart", {
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
        (x, i) => x.price !== current.items[i]?.price || x.quantity !== current.items[i]?.quantity,
      )
    )
      setNotice("Carrinho atualizado conforme preço e disponibilidade atuais.");
    update(next);
  };
  useEffect(() => {
    const initial = readCart(slug);
    setCart(initial);
    void validate(initial);
  }, [slug]);
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white px-5 py-10">
      <Link to="/s/$slug/catalogo" params={{ slug }} className="text-sm text-slate-500">
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
                  <p>{money(i.price)}</p>
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
            <span>{money(cartTotal(cart.items))}</span>
          </div>
          <button
            onClick={() => void validate(cart)}
            className="mt-5 w-full rounded-lg bg-black px-5 py-3 font-semibold text-white"
          >
            Atualizar carrinho
          </button>
          <p className="mt-3 text-sm text-slate-500">
            O pagamento será disponibilizado em etapa posterior.
          </p>
        </>
      )}
    </main>
  );
}
