import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Package,
  Pencil,
  Send,
  Check,
  X,
  Play,
  Pause,
  Archive,
  Boxes,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  Lock,
  Unlock,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import {
  Panel,
  DataTable,
  Badge,
  Btn,
  Field,
  TextInput,
  SelectInput,
  Empty,
  ErrorNote,
  MetricCard,
  type Column,
} from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { brl, num, dateTime, slugify, MODALITY_LABEL, STATUS_LABEL } from "@/lib/admin/format";
import { useCatalogRefs } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

type CStatus = Database["public"]["Enums"]["catalog_status"];
type Modality = Database["public"]["Enums"]["commercial_modality"];
type MoveType = Database["public"]["Enums"]["inventory_movement_type"];

const OFFER_SELECT =
  "id,product_id,status,modalities,moq,lead_time_days,ship_days,drop_config,mixed_config,review_notes,rejection_reason,submitted_at,reviewed_at,created_at,products(id,name,images,brands(name),categories(name)),supplier_offer_variants(id,variant_id,supply_cost,is_active,product_variants(sku,attributes))";

function useOffers(orgId: string) {
  return useQuery({
    queryKey: ["supplier-offers", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_offers")
        .select(OFFER_SELECT)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}
type Offer = NonNullable<ReturnType<typeof useOffers>["data"]>[number];

function useBalances(orgId: string) {
  return useQuery({
    queryKey: ["supplier-balances", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_balances")
        .select("variant_id,on_hand,reserved")
        .eq("organization_id", orgId);
      if (error) throw error;
      return new Map((data ?? []).map((b) => [b.variant_id!, { on_hand: b.on_hand ?? 0, reserved: b.reserved ?? 0 }]));
    },
  });
}

function useInvalidate(orgId: string) {
  const qc = useQueryClient();
  return () => {
    for (const k of [["supplier-offers", orgId], ["supplier-balances", orgId], ["supplier-moves", orgId], ["supplier-360", orgId], ["suppliers"], ["supplier-stats"], ["offers"], ["admin-ops"]])
      qc.invalidateQueries({ queryKey: k });
  };
}

const firstImage = (imgs: unknown) => (Array.isArray(imgs) && typeof imgs[0] === "string" ? (imgs[0] as string) : null);
const attrLabel = (a: unknown) =>
  a && typeof a === "object" ? Object.entries(a as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "";

/* ============================== PRODUTOS ============================== */

export function SupplierProductsTab({ orgId, onEditOffer }: { orgId: string; onEditOffer: (id: string) => void }) {
  const offers = useOffers(orgId);
  const bal = useBalances(orgId);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => {
    const map = new Map<string, { product: NonNullable<Offer["products"]>; offers: Offer[]; skus: Set<string>; mods: Set<string> }>();
    for (const o of offers.data ?? []) {
      if (!o.products) continue;
      const e = map.get(o.product_id) ?? { product: o.products, offers: [], skus: new Set(), mods: new Set() };
      e.offers.push(o);
      o.supplier_offer_variants.forEach((v) => e.skus.add(v.variant_id));
      o.modalities.forEach((m) => e.mods.add(m));
      map.set(o.product_id, e);
    }
    return [...map.values()];
  }, [offers.data]);
  type R = (typeof rows)[number];
  const stock = (r: R) => [...r.skus].reduce((s, v) => { const b = bal.data?.get(v); return s + (b ? b.on_hand - b.reserved : 0); }, 0);
  const cols: Column<R>[] = [
    {
      key: "p", label: "Produto", render: (r) => (
        <div className="flex items-center gap-3">
          {firstImage(r.product.images) ? (
            <img src={firstImage(r.product.images)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary"><Package className="h-4 w-4 text-muted-foreground" /></span>
          )}
          <span className="font-semibold">{r.product.name}</span>
        </div>
      ),
    },
    { key: "b", label: "Marca", render: (r) => r.product.brands?.name ?? "—" },
    { key: "c", label: "Categoria", render: (r) => r.product.categories?.name ?? "—" },
    { key: "s", label: "SKUs", className: "metric", render: (r) => num(r.skus.size) },
    { key: "o", label: "Ofertas", className: "metric", render: (r) => num(r.offers.length) },
    { key: "m", label: "Modalidades", render: (r) => <ModList mods={[...r.mods]} /> },
    { key: "e", label: "Disponível", className: "metric", render: (r) => num(stock(r)) },
    {
      key: "st", label: "Status", render: (r) => {
        const best = r.offers.find((o) => o.status === "active") ?? r.offers[0];
        return best ? <Badge value={best.status} label={STATUS_LABEL[best.status] ?? best.status} /> : "—";
      },
    },
    {
      key: "a", label: "", className: "text-right", render: (r) => (
        <Btn variant="outline" className="h-8 text-xs" onClick={() => onEditOffer(r.offers[0]!.id)}><Pencil className="h-3.5 w-3.5" /> Oferta</Btn>
      ),
    },
  ];
  return (
    <Panel
      title="Produtos do fornecedor"
      description="Produtos são identidades globais do catálogo. Aqui aparecem os que este fornecedor oferta — sem duplicação."
      actions={<Btn onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Adicionar produto</Btn>}
    >
      <DataTable columns={cols} rows={rows} loading={offers.isLoading} rowKey={(r) => r.product.id} empty="Este fornecedor ainda não oferta nenhum produto." />
      {adding && <AddProductModal orgId={orgId} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); onEditOffer(id); }} />}
    </Panel>
  );
}

function AddProductModal({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: (offerId: string) => void }) {
  const inv = useInvalidate(orgId);
  const refs = useCatalogRefs();
  const [mode, setMode] = useState<"search" | "new">("search");
  const [q, setQ] = useState("");
  const found = useQuery({
    queryKey: ["product-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,status,brands(name)").ilike("name", `%${q.trim()}%`).neq("status", "archived").order("name").limit(20);
      if (error) throw error;
      return data;
    },
  });
  const [np, setNp] = useState({ name: "", category_id: "", brand_id: "", description: "", skus: "" });

  const createOffer = async (productId: string) => {
    const { data: ex } = await supabase.from("supplier_offers").select("id").eq("organization_id", orgId).eq("product_id", productId).neq("status", "archived").maybeSingle();
    if (ex) return ex.id;
    const { data, error } = await supabase.from("supplier_offers").insert({ organization_id: orgId, product_id: productId, status: "draft", modalities: [], moq: 1 }).select("id").single();
    if (error) throw error;
    return data.id;
  };
  const link = useMutation({ mutationFn: createOffer, onSuccess: (id) => { inv(); onCreated(id); } });
  const create = useMutation({
    mutationFn: async () => {
      const name = np.name.trim();
      if (name.length < 2) throw new Error("Informe o nome do produto.");
      const skus = np.skus.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!skus.length) throw new Error("Informe ao menos um SKU (um por linha).");
      const { data: dup } = await supabase.from("products").select("id,name").ilike("name", name).limit(1);
      if (dup?.length) throw new Error(`Já existe "${dup[0]!.name}" no catálogo. Use "Buscar produto existente".`);
      const { data: p, error } = await supabase.from("products").insert({
        name, slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`, description: np.description.trim() || null,
        category_id: np.category_id || null, brand_id: np.brand_id || null, owner_organization_id: orgId, status: "draft",
      }).select("id").single();
      if (error) throw error;
      const variants = skus.map((line) => {
        const [sku, ...rest] = line.split("|").map((s) => s.trim());
        const attributes = Object.fromEntries(rest.map((kv) => kv.split("=").map((s) => s.trim())).filter((x) => x.length === 2 && x[0]));
        return { product_id: p.id, sku: sku!.toUpperCase(), attributes };
      });
      const { error: ve } = await supabase.from("product_variants").insert(variants);
      if (ve) throw new Error(ve.message.includes("duplicate") ? "Algum SKU já existe no catálogo." : ve.message);
      return createOffer(p.id);
    },
    onSuccess: (id) => { inv(); onCreated(id); },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Adicionar produto ao fornecedor</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          {(["search", "new"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-semibold", mode === m ? "border-primary bg-primary-soft text-primary" : "border-border")}>
              {m === "search" ? "Buscar produto existente" : "Criar novo produto"}
            </button>
          ))}
        </div>
        {mode === "search" ? (
          <div className="grid gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do produto" className="pl-9" />
            </div>
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
              {q.trim().length < 2 && <li className="p-3 text-sm text-muted-foreground">Digite ao menos 2 letras.</li>}
              {found.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nada encontrado. Crie um novo produto.</li>}
              {found.data?.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.brands?.name ?? "Sem marca"} · {STATUS_LABEL[p.status]}</span>
                  </span>
                  <Btn className="h-8 text-xs" disabled={link.isPending} onClick={() => link.mutate(p.id)}>Vincular via oferta</Btn>
                </li>
              ))}
            </ul>
            <ErrorNote error={link.error} />
          </div>
        ) : (
          <div className="grid gap-3">
            <Field label="Nome *"><TextInput value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} maxLength={160} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria">
                <SelectInput value={np.category_id} onChange={(e) => setNp({ ...np, category_id: e.target.value })}>
                  <option value="">—</option>{refs.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="Marca">
                <SelectInput value={np.brand_id} onChange={(e) => setNp({ ...np, brand_id: e.target.value })}>
                  <option value="">—</option>{refs.data?.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>
            </div>
            <Field label="Descrição"><TextInput value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} maxLength={2000} /></Field>
            <Field label="SKUs * (um por linha)" hint="Formato: SKU | atributo=valor | atributo=valor — ex.: TEN-PRT-38 | cor=preto | tamanho=38">
              <textarea value={np.skus} onChange={(e) => setNp({ ...np, skus: e.target.value })} rows={5}
                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </Field>
            <p className="text-xs text-muted-foreground">O produto entra como rascunho no catálogo global e precisa de aprovação BemMais.</p>
            <ErrorNote error={create.error} />
            <div className="flex justify-end"><Btn disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Criando..." : "Criar produto e oferta"}</Btn></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============================== OFERTAS ============================== */

export function SupplierOffersTab({ orgId, onEditOffer }: { orgId: string; onEditOffer: (id: string) => void }) {
  const offers = useOffers(orgId);
  const inv = useInvalidate(orgId);
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const [filter, setFilter] = useState<"" | CStatus>("");
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CStatus }) => {
      const { error } = await supabase.from("supplier_offers").update({ status, ...(status === "pending_review" ? { rejection_reason: null } : {}) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: inv,
  });
  const rows = (offers.data ?? []).filter((o) => !filter || o.status === filter);
  const counts = Object.fromEntries(Constants.public.Enums.catalog_status.map((s) => [s, (offers.data ?? []).filter((o) => o.status === s).length]));
  const cols: Column<Offer>[] = [
    { key: "p", label: "Produto", render: (o) => <span className="font-semibold">{o.products?.name}</span> },
    { key: "k", label: "SKUs", className: "metric", render: (o) => num(o.supplier_offer_variants.length) },
    {
      key: "c", label: "Custo fornecedor", render: (o) => {
        const c = o.supplier_offer_variants.map((v) => Number(v.supply_cost));
        if (!c.length) return <span className="text-muted-foreground">sem SKUs</span>;
        const lo = Math.min(...c), hi = Math.max(...c);
        return <span className="metric">{lo === hi ? brl(lo) : `${brl(lo)} – ${brl(hi)}`}</span>;
      },
    },
    { key: "m", label: "Modalidades", render: (o) => <ModList mods={o.modalities} /> },
    { key: "q", label: "MOQ", className: "metric", render: (o) => o.moq },
    {
      key: "s", label: "Status", render: (o) => (
        <div className="grid gap-0.5">
          <Badge value={o.status} label={STATUS_LABEL[o.status] ?? o.status} />
          {o.status === "rejected" && o.rejection_reason && <span className="max-w-[14rem] truncate text-[11px] text-danger" title={o.rejection_reason}>{o.rejection_reason}</span>}
          {o.status === "pending_review" && o.submitted_at && <span className="text-[11px] text-muted-foreground">Enviada {dateTime(o.submitted_at)}</span>}
          {o.reviewed_at && (o.status === "approved" || o.status === "active") && <span className="text-[11px] text-muted-foreground">Revisada {dateTime(o.reviewed_at)}</span>}
        </div>
      ),
    },
    {
      key: "a", label: "", className: "text-right whitespace-nowrap", render: (o) => {
        const act = (status: CStatus) => () => setStatus.mutate({ id: o.id, status });
        return (
          <div className="flex justify-end gap-1">
            <IconBtn label="Editar" onClick={() => onEditOffer(o.id)} icon={Pencil} />
            {(o.status === "draft" || o.status === "rejected") && <IconBtn label="Enviar para aprovação" onClick={act("pending_review")} icon={Send} />}
            {o.status === "pending_review" && (<>
              <IconBtn label="Aprovar" onClick={act("approved")} icon={Check} primary />
              <IconBtn label="Rejeitar" onClick={() => setRejecting(o)} icon={X} />
            </>)}
            {(o.status === "approved" || o.status === "paused") && <IconBtn label="Ativar" onClick={act("active")} icon={Play} primary />}
            {o.status === "active" && <IconBtn label="Pausar" onClick={act("paused")} icon={Pause} />}
            {o.status !== "archived" && <IconBtn label="Arquivar" onClick={() => window.confirm("Arquivar esta oferta? O histórico é preservado.") && act("archived")()} icon={Archive} />}
          </div>
        );
      },
    },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip on={!filter} onClick={() => setFilter("")}>Todas · {offers.data?.length ?? 0}</Chip>
        {Constants.public.Enums.catalog_status.map((s) => (
          <Chip key={s} on={filter === s} onClick={() => setFilter(s)}>{STATUS_LABEL[s]} · {counts[s]}</Chip>
        ))}
      </div>
      <Panel
        title="Ofertas do fornecedor"
        description="Condição comercial deste fornecedor por produto: custo por SKU, modalidades, MOQ e prazos. Ciclo: rascunho → aprovação → ativa."
        actions={<Btn onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Criar oferta</Btn>}
      >
        <DataTable columns={cols} rows={rows} loading={offers.isLoading} rowKey={(o) => o.id} empty="Nenhuma oferta neste filtro." />
        <ErrorNote error={setStatus.error} />
      </Panel>
      {adding && <AddProductModal orgId={orgId} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); onEditOffer(id); }} />}
      {rejecting && <RejectModal offer={rejecting} onClose={() => setRejecting(null)} onDone={inv} />}
    </>
  );
}

function RejectModal({ offer, onClose, onDone }: { offer: Offer; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 5) throw new Error("Explique o motivo (mín. 5 caracteres).");
      const { error } = await supabase.from("supplier_offers").update({ status: "rejected", rejection_reason: reason.trim().slice(0, 1000), review_notes: reason.trim().slice(0, 1000) }).eq("id", offer.id);
      if (error) throw error;
    },
    onSuccess: () => { onDone(); onClose(); },
  });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title={`Rejeitar oferta — ${offer.products?.name ?? ""}`} onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error} submitLabel="Rejeitar">
      <Field label="Motivo da rejeição *" hint="O fornecedor verá este motivo para corrigir e reenviar.">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm outline-none focus:border-primary" />
      </Field>
    </FormModal>
  );
}

/* ============================== EDITOR DE OFERTA ============================== */

type DropCfg = { allowed?: boolean; markup_percent?: number | null; ship_days?: number | null; uses_stock?: boolean };
type MixedCfg = { allowed?: boolean; min_qty?: number | null; rules?: string };
const asObj = <T,>(v: unknown): T => (v && typeof v === "object" ? (v as T) : ({} as T));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export function OfferEditor({ orgId, offerId, onClose }: { orgId: string; offerId: string; onClose: () => void }) {
  const inv = useInvalidate(orgId);
  const offers = useOffers(orgId);
  const offer = offers.data?.find((o) => o.id === offerId);
  const variants = useQuery({
    queryKey: ["variants", offer?.product_id],
    enabled: !!offer,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_variants").select("id,sku,attributes").eq("product_id", offer!.product_id).order("sku");
      if (error) throw error;
      return data;
    },
  });
  if (!offer || !variants.data)
    return (
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent><DialogHeader><DialogTitle>Carregando oferta…</DialogTitle></DialogHeader></DialogContent>
      </Dialog>
    );
  return <OfferForm key={offer.id} offer={offer} variants={variants.data} onClose={onClose} onSaved={inv} />;
}

function OfferForm({ offer, variants, onClose, onSaved }: {
  offer: Offer; variants: { id: string; sku: string; attributes: unknown }[]; onClose: () => void; onSaved: () => void;
}) {
  const d0 = asObj<DropCfg>(offer.drop_config);
  const m0 = asObj<MixedCfg>(offer.mixed_config);
  const [mods, setMods] = useState<Modality[]>(offer.modalities);
  const [f, setF] = useState({
    moq: String(offer.moq), lead: offer.lead_time_days?.toString() ?? "", ship: offer.ship_days?.toString() ?? "",
    dMarkup: d0.markup_percent?.toString() ?? "", dShip: d0.ship_days?.toString() ?? "", dStock: !!d0.uses_stock,
    mMin: m0.min_qty?.toString() ?? "", mRules: m0.rules ?? "",
  });
  const existing = new Map(offer.supplier_offer_variants.map((v) => [v.variant_id, v]));
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, existing.has(v.id) ? String(existing.get(v.id)!.supply_cost) : ""])),
  );
  const [tab, setTab] = useState<"geral" | "skus" | "grade">("geral");

  const save = useMutation({
    mutationFn: async () => {
      const moq = Number.parseInt(f.moq, 10);
      if (!Number.isFinite(moq) || moq < 1) throw new Error("MOQ inválido.");
      const entries = Object.entries(costs).filter(([, c]) => c.trim() !== "");
      for (const [, c] of entries) { const n = Number(c.replace(",", ".")); if (!Number.isFinite(n) || n <= 0) throw new Error("Custos devem ser maiores que zero."); }
      const { error } = await supabase.from("supplier_offers").update({
        modalities: mods, moq,
        lead_time_days: f.lead ? Number.parseInt(f.lead, 10) : null,
        ship_days: f.ship ? Number.parseInt(f.ship, 10) : null,
        drop_config: { allowed: mods.includes("drop"), markup_percent: numOrNull(f.dMarkup), ship_days: numOrNull(f.dShip), uses_stock: f.dStock },
        mixed_config: { allowed: mods.includes("mixed_wholesale"), min_qty: numOrNull(f.mMin), rules: f.mRules.trim().slice(0, 1000) },
      }).eq("id", offer.id);
      if (error) throw error;
      if (entries.length) {
        const { error: e } = await supabase.from("supplier_offer_variants").upsert(
          entries.map(([variant_id, c]) => ({ offer_id: offer.id, variant_id, supply_cost: Number(c.replace(",", ".")), is_active: true, organization_id: offer.id })),
          { onConflict: "offer_id,variant_id" },
        );
        if (e) throw e;
      }
      const removed = [...existing.keys()].filter((v) => !costs[v]?.trim());
      if (removed.length) {
        const { error: e } = await supabase.from("supplier_offer_variants").delete().eq("offer_id", offer.id).in("variant_id", removed);
        if (e) throw e;
      }
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Oferta · {offer.products?.name}
            <Badge value={offer.status} label={STATUS_LABEL[offer.status] ?? offer.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b border-border-subtle">
          {([["geral", "Condições e modalidades"], ["skus", `SKUs e custos (${variants.length})`], ["grade", "Grades"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("relative px-3 py-2 text-sm font-semibold", tab === k ? "text-foreground" : "text-muted-foreground")}>
              {l}{tab === k && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {tab === "geral" && (
          <div className="grid gap-4">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-muted-foreground">Modalidades disponíveis</legend>
              <div className="flex flex-wrap gap-1.5">
                {Constants.public.Enums.commercial_modality.map((x) => (
                  <Chip key={x} on={mods.includes(x)} onClick={() => setMods(mods.includes(x) ? mods.filter((y) => y !== x) : [...mods, x])}>{MODALITY_LABEL[x]}</Chip>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="MOQ (unidades)"><TextInput type="number" min={1} value={f.moq} onChange={(e) => setF({ ...f, moq: e.target.value })} /></Field>
              <Field label="Lead time (dias)"><TextInput type="number" min={0} value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} /></Field>
              <Field label="Prazo de expedição (dias)"><TextInput type="number" min={0} value={f.ship} onChange={(e) => setF({ ...f, ship: e.target.value })} /></Field>
            </div>
            {mods.includes("drop") && (
              <div className="rounded-xl border border-border-subtle p-4">
                <h4 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Drop</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Acréscimo específico (%)" hint="Custo operacional do fornecedor. A margem BemMais é calculada à parte."><TextInput inputMode="decimal" value={f.dMarkup} onChange={(e) => setF({ ...f, dMarkup: e.target.value })} /></Field>
                  <Field label="Prazo Drop (dias)"><TextInput type="number" min={0} value={f.dShip} onChange={(e) => setF({ ...f, dShip: e.target.value })} /></Field>
                  <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold">
                    <input type="checkbox" className="accent-[var(--primary)]" checked={f.dStock} onChange={(e) => setF({ ...f, dStock: e.target.checked })} /> Usa estoque do fornecedor
                  </label>
                </div>
              </div>
            )}
            {mods.includes("mixed_wholesale") && (
              <div className="rounded-xl border border-border-subtle p-4">
                <h4 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Atacado variado</h4>
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <Field label="MOQ variado"><TextInput type="number" min={1} value={f.mMin} onChange={(e) => setF({ ...f, mMin: e.target.value })} /></Field>
                  <Field label="Regras"><TextInput value={f.mRules} onChange={(e) => setF({ ...f, mRules: e.target.value })} maxLength={1000} placeholder="Ex.: mínimo de 3 modelos diferentes" /></Field>
                </div>
              </div>
            )}
            {mods.includes("closed_grade") && <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">Configure as composições na aba Grades.</p>}
          </div>
        )}

        {tab === "skus" && (
          variants.length ? (
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">Informe o custo do fornecedor para os SKUs ofertados. Deixe vazio para não ofertar. Informação restrita à BemMais e ao próprio fornecedor.</p>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                {variants.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-semibold">{v.sku}</span>
                      <span className="text-[11px] text-muted-foreground">{attrLabel(v.attributes)}</span>
                    </span>
                    <TextInput aria-label={`Custo ${v.sku}`} inputMode="decimal" placeholder="R$ 0,00" value={costs[v.id] ?? ""} onChange={(e) => setCosts({ ...costs, [v.id]: e.target.value })} className="w-32" />
                  </div>
                ))}
              </div>
            </div>
          ) : <Empty text="Este produto ainda não tem SKUs. Cadastre-os em Produtos." />
        )}

        {tab === "grade" && <GradeEditor offer={offer} variants={variants} />}

        {tab !== "grade" && (<>
          <ErrorNote error={save.error} />
          <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
            <Btn disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Salvando..." : "Salvar oferta"}</Btn>
          </div>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

function GradeEditor({ offer, variants }: { offer: Offer; variants: { id: string; sku: string; attributes: unknown }[] }) {
  const qc = useQueryClient();
  const grades = useQuery({
    queryKey: ["grades", offer.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("grade_compositions").select("id,name,items,total_units,price,is_active").eq("offer_id", offer.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["grades", offer.id] });
  const add = useMutation({
    mutationFn: async () => {
      const items = Object.entries(qty).map(([variant_id, q]) => ({ variant_id, qty: Number.parseInt(q, 10) || 0 })).filter((i) => i.qty > 0);
      if (!name.trim()) throw new Error("Dê um nome à grade.");
      if (!items.length) throw new Error("Informe a quantidade de ao menos um SKU.");
      const total = items.reduce((s, i) => s + i.qty, 0);
      const p = numOrNull(price);
      if (p !== null && (!Number.isFinite(p) || p <= 0)) throw new Error("Preço inválido.");
      const { error } = await supabase.from("grade_compositions").insert({ offer_id: offer.id, organization_id: offer.id, name: name.trim().slice(0, 120), items, total_units: total, price: p });
      if (error) throw error;
    },
    onSuccess: () => { setName(""); setPrice(""); setQty({}); refresh(); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("grade_compositions").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh,
  });
  const total = Object.values(qty).reduce((s, q) => s + (Number.parseInt(q, 10) || 0), 0);
  return (
    <div className="grid gap-4">
      {grades.data?.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {grades.data.map((g) => (
            <div key={g.id} className="rounded-xl border border-border-subtle p-3">
              <div className="mb-1 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="flex-1 font-semibold">{g.name}</span>
                <button aria-label="Remover grade" onClick={() => window.confirm("Remover esta grade?") && del.mutate(g.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">{g.total_units} peças{g.price != null ? ` · ${brl(Number(g.price))}` : ""}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {(Array.isArray(g.items) ? (g.items as { variant_id: string; qty: number }[]) : []).map((i) => `${skuOf.get(i.variant_id) ?? "SKU"}×${i.qty}`).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Nenhuma grade configurada. A composição é livre — não há número fixo de peças.</p>}
      {variants.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-4">
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Nova composição</h4>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Field label="Nome"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Grade 34–39" /></Field>
            <Field label="Preço da grade (R$, opcional)"><TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {variants.map((v) => (
              <label key={v.id} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono" title={attrLabel(v.attributes)}>{v.sku}</span>
                <input type="number" min={0} value={qty[v.id] ?? ""} onChange={(e) => setQty({ ...qty, [v.id]: e.target.value })} className="w-14 rounded border border-border bg-surface-elevated px-1.5 py-1 text-right" aria-label={`Quantidade ${v.sku}`} />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Total: <b className="metric text-foreground">{total}</b> peças</span>
            <Btn disabled={add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar grade</Btn>
          </div>
          <ErrorNote error={add.error ?? del.error} />
        </div>
      )}
    </div>
  );
}

/* ============================== ESTOQUE ============================== */

const MOVE_TYPES: { key: MoveType; label: string; icon: typeof ArrowDownToLine }[] = [
  { key: "in", label: "Entrada", icon: ArrowDownToLine },
  { key: "adjust", label: "Ajuste", icon: SlidersHorizontal },
  { key: "out", label: "Saída", icon: ArrowUpFromLine },
  { key: "reserve", label: "Reserva", icon: Lock },
  { key: "release", label: "Liberação", icon: Unlock },
];
const MOVE_LABEL: Record<string, string> = { ...Object.fromEntries(MOVE_TYPES.map((m) => [m.key, m.label])), return: "Devolução" };

export function SupplierStockTab({ orgId }: { orgId: string }) {
  const offers = useOffers(orgId);
  const bal = useBalances(orgId);
  const inv = useInvalidate(orgId);
  const moves = useQuery({
    queryKey: ["supplier-moves", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_movements").select("id,movement_type,quantity,reason,created_at,product_variants(sku)").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });
  const [move, setMove] = useState<{ type: MoveType; variant?: string } | null>(null);
  const skuRows = (offers.data ?? []).flatMap((o) =>
    o.supplier_offer_variants.map((v) => ({ key: v.id, variant_id: v.variant_id, offer_variant_id: v.id, sku: v.product_variants?.sku ?? "—", product: o.products?.name ?? "—", offerStatus: o.status, ...(bal.data?.get(v.variant_id) ?? { on_hand: 0, reserved: 0 }) })),
  );
  type R = (typeof skuRows)[number];
  const tot = skuRows.reduce((a, r) => ({ on: a.on + r.on_hand, res: a.res + r.reserved }), { on: 0, res: 0 });
  const cols: Column<R>[] = [
    { key: "p", label: "Produto", render: (r) => <span className="font-semibold">{r.product}</span> },
    { key: "s", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: "o", label: "Oferta", render: (r) => <Badge value={r.offerStatus} label={STATUS_LABEL[r.offerStatus] ?? r.offerStatus} /> },
    { key: "h", label: "Em mãos", className: "metric", render: (r) => num(r.on_hand) },
    { key: "r", label: "Reservado", className: "metric", render: (r) => num(r.reserved) },
    { key: "d", label: "Disponível", className: "metric", render: (r) => { const d = r.on_hand - r.reserved; return <span className={cn("font-bold", d < 0 ? "text-danger" : d === 0 ? "text-muted-foreground" : "")}>{num(d)}</span>; } },
    { key: "a", label: "", className: "text-right", render: (r) => <Btn variant="outline" className="h-8 text-xs" onClick={() => setMove({ type: "in", variant: r.offer_variant_id })}>Movimentar</Btn> },
  ];
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Em mãos" value={num(tot.on)} />
        <MetricCard label="Reservado" value={num(tot.res)} />
        <MetricCard label="Disponível" value={num(tot.on - tot.res)} tone="brand" />
        <MetricCard label="SKUs negativos" value={num(skuRows.filter((r) => r.on_hand - r.reserved < 0).length)} />
      </div>
      <Panel
        title="Estoque do fornecedor"
        description="Saldo derivado do histórico de movimentações — nunca sobrescrito."
        actions={<div className="flex flex-wrap gap-1.5">{MOVE_TYPES.map((m) => { const I = m.icon; return <Btn key={m.key} variant="outline" className="h-9 text-xs" onClick={() => setMove({ type: m.key })}><I className="h-3.5 w-3.5" /> {m.label}</Btn>; })}</div>}
      >
        <DataTable columns={cols} rows={skuRows} loading={offers.isLoading || bal.isLoading} rowKey={(r) => r.key} empty="Sem SKUs ofertados. Configure custos por SKU em uma oferta para controlar estoque." />
      </Panel>
      <Panel title="Últimas movimentações" className="mt-4">
        {moves.data?.length ? (
          <ul className="divide-y divide-border-subtle">
            {moves.data.map((mv) => (
              <li key={mv.id} className="flex items-center gap-3 py-2 text-sm">
                <Badge value={mv.movement_type} label={MOVE_LABEL[mv.movement_type] ?? mv.movement_type} tone={mv.movement_type === "in" || mv.movement_type === "return" ? "ok" : mv.movement_type === "out" ? "bad" : "info"} />
                <span className="font-mono text-xs">{mv.product_variants?.sku}</span>
                <span className="metric font-bold">{mv.quantity > 0 && mv.movement_type === "adjust" ? "+" : ""}{mv.quantity}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{mv.reason}</span>
                <span className="text-xs text-muted-foreground">{dateTime(mv.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty text="Nenhuma movimentação registrada." />}
      </Panel>
      {move && <MoveModal orgId={orgId} initial={move} rows={skuRows} onClose={() => setMove(null)} onDone={inv} />}
    </>
  );
}

function MoveModal({ orgId, initial, rows, onClose, onDone }: {
  orgId: string; initial: { type: MoveType; variant?: string };
  rows: { offer_variant_id: string; variant_id: string; sku: string; product: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [type, setType] = useState<MoveType>(initial.type);
  const [ov, setOv] = useState(initial.variant ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const row = rows.find((r) => r.offer_variant_id === ov);
      if (!row) throw new Error("Selecione o SKU.");
      const q = Number.parseInt(qty, 10);
      if (!Number.isFinite(q) || q === 0) throw new Error("Quantidade inválida.");
      if (type !== "adjust" && q < 0) throw new Error("Use quantidade positiva. Para reduzir saldo use Saída ou Ajuste negativo.");
      if ((type === "adjust" || type === "out") && reason.trim().length < 3) throw new Error("Ajustes e saídas exigem motivo.");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("inventory_movements").insert({
        organization_id: orgId, variant_id: row.variant_id, offer_variant_id: row.offer_variant_id, movement_type: type, quantity: q,
        reason: reason.trim().slice(0, 500) || null, reference_type: "manual", created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { onDone(); onClose(); },
  });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Movimentar estoque" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error} submitLabel="Registrar">
      <div className="flex flex-wrap gap-1.5">{MOVE_TYPES.map((t) => <Chip key={t.key} on={type === t.key} onClick={() => setType(t.key)}>{t.label}</Chip>)}</div>
      <Field label="SKU">
        <SelectInput value={ov} onChange={(e) => setOv(e.target.value)} required>
          <option value="">Selecione...</option>
          {rows.map((r) => <option key={r.offer_variant_id} value={r.offer_variant_id}>{r.sku} — {r.product}</option>)}
        </SelectInput>
      </Field>
      <Field label={type === "adjust" ? "Quantidade (use negativo para reduzir)" : "Quantidade"}><TextInput type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      <Field label={type === "adjust" || type === "out" ? "Motivo *" : "Motivo"}><TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      <p className="text-xs text-muted-foreground">Registrado com seu usuário, data e hora. Movimentações não podem ser editadas nem apagadas.</p>
    </FormModal>
  );
}

/* ============================== helpers ============================== */

function ModList({ mods }: { mods: string[] }) {
  if (!mods.length) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{mods.map((x) => <span key={x} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">{MODALITY_LABEL[x] ?? x}</span>)}</div>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", on ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-foreground/30")}>
      {children}
    </button>
  );
}
function IconBtn({ label, onClick, icon: I, primary }: { label: string; onClick: () => void; icon: typeof Check; primary?: boolean }) {
  return (
    <Btn variant={primary ? "primary" : "outline"} className="h-8 w-8 p-0" aria-label={label} title={label} onClick={onClick}>
      <I className="h-3.5 w-3.5" />
    </Btn>
  );
}
