import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DataTable, Pager, Btn, Field, TextInput, SelectInput } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { dateTime, num, pageRange } from "@/lib/admin/format";
import { useOrgOptions } from "@/lib/admin/queries";

export const Route = createFileRoute("/_authenticated/admin/estoque")({ component: Stock });
type MType = Database["public"]["Enums"]["inventory_movement_type"];
const MT_LABEL: Record<MType, string> = { in: "Entrada", out: "Saída", reserve: "Reserva", release: "Liberação", adjust: "Ajuste (+/-)", return: "Devolução" };

function Stock() {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const balances = useQuery({
    queryKey: ["inv-bal", page],
    queryFn: async () => {
      const { data, error, count } = await supabase.from("inventory_balances").select("organization_id,variant_id,on_hand,reserved", { count: "exact" }).range(...pageRange(page));
      if (error) throw error;
      const vIds = [...new Set(data.map((d) => d.variant_id!).filter(Boolean))];
      const oIds = [...new Set(data.map((d) => d.organization_id!).filter(Boolean))];
      const [v, o] = await Promise.all([
        vIds.length ? supabase.from("product_variants").select("id,sku,products(name)").in("id", vIds) : Promise.resolve({ data: [] as { id: string; sku: string; products: { name: string } | null }[] }),
        oIds.length ? supabase.from("organizations").select("id,name").in("id", oIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const vm = new Map((v.data ?? []).map((x) => [x.id, x]));
      const om = new Map((o.data ?? []).map((x) => [x.id, x.name]));
      return { count, rows: data.map((d) => ({ ...d, key: `${d.organization_id}-${d.variant_id}`, sku: vm.get(d.variant_id!)?.sku, product: vm.get(d.variant_id!)?.products?.name, org: om.get(d.organization_id!) })) };
    },
  });
  const moves = useQuery({
    queryKey: ["inv-moves"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_movements").select("id,movement_type,quantity,reason,created_at,product_variants(sku),organizations(name)").order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      return data;
    },
  });
  type B = NonNullable<typeof balances.data>["rows"][number];
  type M = NonNullable<typeof moves.data>[number];
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Estoque" description="Saldo calculado a partir das movimentações (histórico imutável). Disponível = em mãos − reservado."
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Registrar movimentação</Btn>} />
      <Panel title="Saldos">
        <DataTable<B> rowKey={(r) => r.key} rows={balances.data?.rows} loading={balances.isLoading} empty="Nenhuma movimentação de estoque." columns={[
          { key: "s", label: "SKU", render: (r) => <div><p className="font-semibold">{r.sku}</p><p className="text-xs text-muted-foreground">{r.product}</p></div> },
          { key: "o", label: "Dono do estoque", render: (r) => r.org },
          { key: "h", label: "Em mãos", render: (r) => num(r.on_hand) },
          { key: "r", label: "Reservado", render: (r) => num(r.reserved) },
          { key: "a", label: "Disponível", render: (r) => { const a = (r.on_hand ?? 0) - (r.reserved ?? 0); return <b className={a <= 0 ? "text-destructive" : ""}>{num(a)}</b>; } },
        ]} />
        <Pager page={page} setPage={setPage} total={balances.data?.count} />
      </Panel>
      <Panel title="Últimas movimentações" className="mt-4">
        <DataTable<M> rowKey={(r) => String(r.id)} rows={moves.data} loading={moves.isLoading} columns={[
          { key: "d", label: "Quando", render: (r) => <span className="text-xs">{dateTime(r.created_at)}</span> },
          { key: "t", label: "Tipo", render: (r) => MT_LABEL[r.movement_type] },
          { key: "s", label: "SKU", render: (r) => r.product_variants?.sku },
          { key: "o", label: "Dono", render: (r) => r.organizations?.name },
          { key: "q", label: "Qtd.", render: (r) => r.quantity },
          { key: "m", label: "Motivo", render: (r) => r.reason ?? "—" },
        ]} />
      </Panel>
      {open && <Move onClose={() => setOpen(false)} />}
    </>
  );
}

function Move({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const orgs = useOrgOptions();
  const [f, setF] = useState({ organization_id: "", sku: "", movement_type: "in" as MType, quantity: "", reason: "" });
  const m = useMutation({
    mutationFn: async () => {
      if (!f.organization_id) throw new Error("Selecione o dono do estoque.");
      const q = Number.parseInt(f.quantity, 10);
      if (!Number.isFinite(q) || q === 0 || (f.movement_type !== "adjust" && q < 0)) throw new Error("Quantidade inválida.");
      const { data: v, error: ve } = await supabase.from("product_variants").select("id").eq("sku", f.sku.trim()).maybeSingle();
      if (ve) throw ve;
      if (!v) throw new Error("SKU não encontrado.");
      const { error } = await supabase.from("inventory_movements").insert({ organization_id: f.organization_id, variant_id: v.id, movement_type: f.movement_type, quantity: q, reason: f.reason || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-bal"] }); qc.invalidateQueries({ queryKey: ["inv-moves"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Registrar movimentação" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="Dono do estoque"><SelectInput value={f.organization_id} onChange={set("organization_id")}><option value="">Selecione...</option>{orgs.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectInput></Field>
      <Field label="SKU"><TextInput value={f.sku} onChange={set("sku")} required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo"><SelectInput value={f.movement_type} onChange={set("movement_type")}>{Constants.public.Enums.inventory_movement_type.map((s) => <option key={s} value={s}>{MT_LABEL[s]}</option>)}</SelectInput></Field>
        <Field label="Quantidade"><TextInput type="number" value={f.quantity} onChange={set("quantity")} /></Field>
      </div>
      <Field label="Motivo"><TextInput value={f.reason} onChange={set("reason")} maxLength={200} /></Field>
    </FormModal>
  );
}
