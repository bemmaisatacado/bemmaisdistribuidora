import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHostname, platformHostname } from "@/lib/domains/hostname";
import { Btn, Field, Panel, TextInput } from "@/components/admin/ui";
import { Badge } from "@/components/admin/ui";

type Domain = {
  id: string;
  hostname: string;
  type: string;
  status?: string;
  verification_status: string;
  is_primary: boolean;
};
const label: Record<string, string> = {
  active: "Ativo",
  pending_configuration: "Aguardando configuração",
  pending_verification: "Aguardando verificação",
  error: "Erro",
  disabled: "Desativado",
  pending: "Aguardando configuração",
  verifying: "Verificando",
};
export function StoreDomainsPanel({
  storeId,
  organizationId,
  slug,
}: {
  storeId: string;
  organizationId: string;
  slug: string;
}) {
  const qc = useQueryClient();
  const [hostname, setHostname] = useState("");
  const domains = useQuery({
    queryKey: ["store-domains", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_domains")
        .select("id,hostname,type,status,verification_status,is_primary")
        .eq("store_id", storeId)
        .order("created_at");
      if (error) throw error;
      return data as Domain[];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const value = normalizeHostname(hostname);
      if (!value) throw new Error("Informe um hostname válido, sem caminho ou protocolo.");
      const { error } = await (supabase as any).from("store_domains").insert({
        store_id: storeId,
        organization_id: organizationId,
        hostname: value,
        type: "custom_domain",
        is_primary: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setHostname("");
      qc.invalidateQueries({ queryKey: ["store-domains", storeId] });
    },
  });
  const primary = useMutation({
    mutationFn: async (domain: Domain) => {
      if (domain.status !== "active" && domain.verification_status !== "active")
        throw new Error("Somente um domínio ativo e verificado pode ser principal.");
      const { error: first } = await supabase
        .from("store_domains")
        .update({ is_primary: false })
        .eq("store_id", storeId)
        .eq("is_primary", true);
      if (first) throw first;
      const { error } = await supabase
        .from("store_domains")
        .update({ is_primary: true })
        .eq("id", domain.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-domains", storeId] }),
  });
  const disable = useMutation({
    mutationFn: async (domain: Domain) => {
      if (domain.type === "platform_subdomain")
        throw new Error("O endereço BemMais acompanha o slug da loja.");
      const { error } = await supabase
        .from("store_domains")
        .update({ is_primary: false })
        .eq("id", domain.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-domains", storeId] }),
  });
  return (
    <Panel
      title="Domínios"
      description="Hostnames vinculados à loja. A BemMais ainda não exibe instruções DNS até o provider ser configurado."
    >
      <div className="space-y-4 p-5">
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Endereço BemMais</p>
          <p className="mt-1 font-mono text-sm font-semibold">{platformHostname(slug)}</p>
        </div>
        <div className="space-y-2">
          {domains.data?.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="font-mono text-sm">{d.hostname}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.type === "platform_subdomain" ? "Subdomínio BemMais" : "Domínio personalizado"}
                  {d.is_primary ? " · principal" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  value={d.status ?? d.verification_status}
                  label={label[d.status ?? d.verification_status] ?? d.verification_status}
                />
                {!d.is_primary ? (
                  <Btn
                    variant="outline"
                    onClick={() => primary.mutate(d)}
                    disabled={(d.status ?? d.verification_status) !== "active"}
                  >
                    Definir principal
                  </Btn>
                ) : null}
                {d.type === "custom_domain" ? (
                  <Btn variant="outline" onClick={() => disable.mutate(d)}>
                    Desativar
                  </Btn>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <Field
            label="Conectar domínio personalizado"
            hint="As instruções reais serão disponibilizadas após a configuração da infraestrutura BemMais."
          >
            <TextInput
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="minhaloja.com.br"
            />
          </Field>
          <Btn className="self-end" type="submit" disabled={add.isPending}>
            Adicionar domínio
          </Btn>
        </form>
        {add.error || primary.error || disable.error ? (
          <p className="text-sm text-destructive">
            {String(
              (add.error || primary.error || disable.error)?.message ||
                "Não foi possível atualizar domínio.",
            )}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
