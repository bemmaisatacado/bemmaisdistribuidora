import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/admin/ui";

export const Route = createFileRoute("/_authenticated/admin/modalidades")({ component: Modalities });

const MODS = [
  { k: "Drop", d: "O fornecedor envia direto ao consumidor final. Sem estoque para o lojista." },
  { k: "Atacado variado", d: "Compra de várias referências e tamanhos, respeitando o pedido mínimo de cada oferta." },
  { k: "Grade fechada", d: "Compra por grade com composição própria definida na oferta (tamanhos × quantidades)." },
  { k: "Varejo", d: "Venda unitária ao consumidor final pela loja." },
  { k: "Atacado", d: "Venda em volume para outras empresas." },
];

function Modalities() {
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Modalidades comerciais" description="Modalidades não são tipos de usuário: cada oferta escolhe em quais participa, e a BemMais pode aprovar ou restringir." />
      <Panel>
        <ul className="divide-y divide-border">
          {MODS.map((m) => <li key={m.k} className="px-4 py-3"><p className="font-semibold">{m.k}</p><p className="text-sm text-muted-foreground">{m.d}</p></li>)}
        </ul>
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Pedido mínimo e composição de grade são configurados em cada oferta — nada é fixo no sistema.</p>
    </>
  );
}
