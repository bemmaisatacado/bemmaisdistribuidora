/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Field, Panel, SelectInput, TextInput } from "@/components/admin/ui";
import { uploadStoreImage } from "@/lib/store-media";
import { defaultTheme, sanitizeTheme } from "@/lib/storefront";

const db: any = supabase;
const presets = {
  Minimal: { ...defaultTheme },
  Urban: {
    ...defaultTheme,
    primary: "#101114",
    accent: "#e8641e",
    background: "#f7f7f5",
    radius: "small",
  },
  Premium: {
    ...defaultTheme,
    primary: "#211b16",
    accent: "#b78c4d",
    background: "#fbf8f3",
    radius: "large",
  },
  Bold: {
    ...defaultTheme,
    primary: "#18181b",
    accent: "#ff5a1f",
    background: "#fff",
    radius: "none",
  },
  Clean: {
    ...defaultTheme,
    primary: "#155e75",
    accent: "#0f766e",
    background: "#f8fafc",
    radius: "medium",
  },
};
const kinds = ["home", "catalog", "category", "collection", "page", "external"];
export function StoreBuilderWorkspace({ store }: { store: any }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("theme");
  const [theme, setTheme] = useState(() => sanitizeTheme(store.theme));
  const [seo, setSeo] = useState<any>(store.seo ?? {});
  const [newPage, setNewPage] = useState({ title: "", slug: "", content: "" });
  const [newNav, setNewNav] = useState({ label: "", kind: "catalog", target: "" });
  const q = useQuery({
    queryKey: ["store-builder-content", store.id],
    queryFn: async () => {
      const [sections, pages, nav] = await Promise.all([
        db.from("store_sections").select("*").eq("store_id", store.id).order("position"),
        db.from("store_pages").select("*").eq("store_id", store.id).order("created_at"),
        db.from("store_navigation_items").select("*").eq("store_id", store.id).order("position"),
      ]);
      if (sections.error || pages.error || nav.error)
        throw sections.error || pages.error || nav.error;
      return { sections: sections.data ?? [], pages: pages.data ?? [], nav: nav.data ?? [] };
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("stores").update({ theme, seo }).eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-builder", store.id] }),
  });
  const upload = useMutation({
    mutationFn: async ({ file, field }: { file: File; field: "logo_url" | "favicon_url" }) => {
      const url = await uploadStoreImage(store.id, file);
      const { error } = await db
        .from("stores")
        .update({ [field]: url })
        .eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-builder", store.id] }),
  });
  const addSection = useMutation({
    mutationFn: async (type: string) => {
      const { error } = await db.from("store_sections").insert({
        store_id: store.id,
        organization_id: store.organization_id,
        type,
        position: q.data?.sections.length ?? 0,
        is_enabled: true,
        config: { title: "" },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-builder-content", store.id] }),
  });
  const updateSection = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await db.from("store_sections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-builder-content", store.id] }),
  });
  const addPage = useMutation({
    mutationFn: async () => {
      if (!newPage.title.trim() || !newPage.slug.trim()) throw new Error("Informe título e slug.");
      const content = newPage.content.replace(/<[^>]*>/g, "");
      const { error } = await db.from("store_pages").insert({
        store_id: store.id,
        organization_id: store.organization_id,
        title: newPage.title.trim(),
        slug: newPage.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        content,
        is_published: false,
        seo: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPage({ title: "", slug: "", content: "" });
      qc.invalidateQueries({ queryKey: ["store-builder-content", store.id] });
    },
  });
  const addNav = useMutation({
    mutationFn: async () => {
      if (!newNav.label.trim()) throw new Error("Informe o rótulo.");
      const { error } = await db.from("store_navigation_items").insert({
        store_id: store.id,
        organization_id: store.organization_id,
        label: newNav.label.trim(),
        kind: newNav.kind,
        target: newNav.target,
        position: q.data?.nav.length ?? 0,
        is_enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewNav({ label: "", kind: "catalog", target: "" });
      qc.invalidateQueries({ queryKey: ["store-builder-content", store.id] });
    },
  });
  const preview = useMemo(
    () => ({
      background: theme.background,
      color: theme.text,
      borderColor: theme.border,
      fontFamily: theme.fontBody,
    }),
    [theme],
  );
  return (
    <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-1 rounded-2xl border bg-card p-3">
        {[
          ["theme", "Tema & branding"],
          ["sections", "Seções"],
          ["navigation", "Navegação"],
          ["pages", "Páginas"],
          ["seo", "SEO"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </aside>
      <div className="space-y-5">
        <Panel title="Preview" description="Rascunho visual; salvar não publica a loja.">
          <div className="m-5 overflow-hidden rounded-2xl border" style={preview}>
            <div className="flex items-center gap-3 border-b p-4">
              <img
                src={store.logo_url || "/favicon.png"}
                alt=""
                className="h-8 w-8 rounded object-cover"
              />
              <b>{store.name}</b>
              <span className="ml-auto text-xs opacity-60">Desktop · Tablet · Mobile</span>
            </div>
            <div className="p-8" style={{ background: theme.background }}>
              <p style={{ color: theme.accent }} className="text-xs font-bold">
                PREVIEW
              </p>
              <h2 className="mt-2 text-3xl font-bold">Sua loja, sua marca.</h2>
              <p className="mt-2 opacity-70">
                Tema, identidade e seções são visualizados antes da publicação.
              </p>
            </div>
          </div>
        </Panel>
        {tab === "theme" ? (
          <Panel title="Tema e branding">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <MediaField
                label="Logo"
                current={store.logo_url}
                onFile={(file) => upload.mutate({ file, field: "logo_url" })}
              />
              <MediaField
                label="Favicon"
                current={store.favicon_url}
                onFile={(file) => upload.mutate({ file, field: "favicon_url" })}
              />
              {Object.keys(presets).map((name) => (
                <Btn
                  key={name}
                  variant="outline"
                  onClick={() => setTheme(presets[name as keyof typeof presets])}
                >
                  Aplicar {name}
                </Btn>
              ))}
              {["primary", "secondary", "accent", "background", "surface", "text", "border"].map(
                (k) => (
                  <Field key={k} label={k}>
                    <TextInput
                      type="color"
                      value={(theme as any)[k]}
                      onChange={(e) => setTheme({ ...theme, [k]: e.target.value })}
                    />
                  </Field>
                ),
              )}
              <Field label="Radius">
                <SelectInput
                  value={theme.radius}
                  onChange={(e) => setTheme({ ...theme, radius: e.target.value as any })}
                >
                  <option value="none">Reto</option>
                  <option value="small">Pequeno</option>
                  <option value="medium">Médio</option>
                  <option value="large">Grande</option>
                </SelectInput>
              </Field>
              <Field label="Tipografia">
                <SelectInput
                  value={theme.fontBody}
                  onChange={(e) =>
                    setTheme({
                      ...theme,
                      fontBody: e.target.value as any,
                      fontHeading: e.target.value as any,
                    })
                  }
                >
                  <option value="manrope">Manrope</option>
                  <option value="sora">Sora</option>
                </SelectInput>
              </Field>
              <Btn onClick={() => save.mutate()} disabled={save.isPending}>
                Salvar tema
              </Btn>
            </div>
          </Panel>
        ) : null}
        {tab === "sections" ? (
          <Panel title="Seções da Home">
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                {[
                  "hero",
                  "banner",
                  "categories",
                  "featured_products",
                  "product_carousel",
                  "promotion",
                  "benefits",
                  "image_text",
                  "brands",
                  "whatsapp_cta",
                  "newsletter",
                  "footer",
                ].map((type) => (
                  <Btn key={type} variant="outline" onClick={() => addSection.mutate(type)}>
                    + {type}
                  </Btn>
                ))}
              </div>
              {q.data?.sections.map((s: any, i: number) => (
                <div key={s.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <b>{s.type}</b>
                    <label className="text-xs">
                      <input
                        type="checkbox"
                        checked={s.is_enabled}
                        onChange={(e) =>
                          updateSection.mutate({
                            id: s.id,
                            patch: { is_enabled: e.target.checked },
                          })
                        }
                      />{" "}
                      Ativa
                    </label>
                  </div>
                  <TextInput
                    className="mt-2"
                    value={s.config?.title ?? s.config?.headline ?? ""}
                    placeholder="Título / headline"
                    onChange={(e) =>
                      updateSection.mutate({
                        id: s.id,
                        patch: {
                          config: { ...s.config, title: e.target.value, headline: e.target.value },
                        },
                      })
                    }
                  />
                  {["hero", "banner", "image_text"].includes(s.type) ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <MediaField
                        label="Imagem desktop"
                        current={s.config?.image_desktop}
                        onFile={async (file) => {
                          const url = await uploadStoreImage(store.id, file);
                          updateSection.mutate({
                            id: s.id,
                            patch: { config: { ...s.config, image_desktop: url } },
                          });
                        }}
                      />
                      <MediaField
                        label="Imagem mobile"
                        current={s.config?.image_mobile}
                        onFile={async (file) => {
                          const url = await uploadStoreImage(store.id, file);
                          updateSection.mutate({
                            id: s.id,
                            patch: { config: { ...s.config, image_mobile: url } },
                          });
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Btn
                      variant="outline"
                      onClick={() =>
                        updateSection.mutate({ id: s.id, patch: { position: Math.max(0, i - 1) } })
                      }
                    >
                      ↑
                    </Btn>
                    <Btn
                      variant="outline"
                      onClick={() => updateSection.mutate({ id: s.id, patch: { position: i + 1 } })}
                    >
                      ↓
                    </Btn>
                    <Btn variant="outline" onClick={() => addSection.mutate(s.type)}>
                      Duplicar
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
        {tab === "navigation" ? (
          <Panel title="Menu da loja">
            <div className="space-y-3 p-5">
              {q.data?.nav.map((n: any) => (
                <div key={n.id} className="flex justify-between rounded-lg border p-3">
                  <span>
                    {n.label} · {n.kind}
                  </span>
                  <Btn
                    variant="outline"
                    onClick={() =>
                      db
                        .from("store_navigation_items")
                        .update({ is_enabled: !n.is_enabled })
                        .eq("id", n.id)
                        .then(() =>
                          qc.invalidateQueries({ queryKey: ["store-builder-content", store.id] }),
                        )
                    }
                  >
                    {n.is_enabled ? "Desativar" : "Ativar"}
                  </Btn>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-3">
                <TextInput
                  value={newNav.label}
                  onChange={(e) => setNewNav({ ...newNav, label: e.target.value })}
                  placeholder="Rótulo"
                />
                <SelectInput
                  value={newNav.kind}
                  onChange={(e) => setNewNav({ ...newNav, kind: e.target.value })}
                >
                  {kinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </SelectInput>
                <TextInput
                  value={newNav.target}
                  onChange={(e) => setNewNav({ ...newNav, target: e.target.value })}
                  placeholder="Destino"
                />
              </div>
              <Btn onClick={() => addNav.mutate()}>Adicionar item</Btn>
            </div>
          </Panel>
        ) : null}
        {tab === "pages" ? (
          <Panel title="Páginas institucionais">
            <div className="space-y-3 p-5">
              {q.data?.pages.map((p: any) => (
                <div key={p.id} className="flex justify-between rounded-lg border p-3">
                  <span>
                    {p.title} · /{p.slug}
                  </span>
                  <Btn
                    variant="outline"
                    onClick={() =>
                      db
                        .from("store_pages")
                        .update({ is_published: !p.is_published })
                        .eq("id", p.id)
                        .then(() =>
                          qc.invalidateQueries({ queryKey: ["store-builder-content", store.id] }),
                        )
                    }
                  >
                    {p.is_published ? "Despublicar" : "Publicar"}
                  </Btn>
                </div>
              ))}
              <TextInput
                value={newPage.title}
                onChange={(e) => setNewPage({ ...newPage, title: e.target.value })}
                placeholder="Título"
              />
              <TextInput
                value={newPage.slug}
                onChange={(e) => setNewPage({ ...newPage, slug: e.target.value })}
                placeholder="Slug"
              />
              <textarea
                className="min-h-32 w-full rounded-lg border p-3"
                value={newPage.content}
                onChange={(e) => setNewPage({ ...newPage, content: e.target.value })}
                placeholder="Conteúdo seguro em texto. Não insira HTML ou scripts."
              />
              <Btn onClick={() => addPage.mutate()}>Criar página</Btn>
            </div>
          </Panel>
        ) : null}
        {tab === "seo" ? (
          <Panel title="SEO global">
            <div className="grid gap-3 p-5">
              <Field label="Título padrão">
                <TextInput
                  value={seo.title ?? ""}
                  onChange={(e) => setSeo({ ...seo, title: e.target.value })}
                />
              </Field>
              <Field label="Descrição">
                <TextInput
                  value={seo.description ?? ""}
                  onChange={(e) => setSeo({ ...seo, description: e.target.value })}
                />
              </Field>
              <MediaField
                label="Imagem social"
                current={seo.social_image}
                onFile={async (file) => {
                  const url = await uploadStoreImage(store.id, file);
                  setSeo({ ...seo, social_image: url });
                }}
              />
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={seo.noindex === true}
                  onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })}
                />{" "}
                Desativar indexação
              </label>
              <Btn onClick={() => save.mutate()}>Salvar SEO</Btn>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
function MediaField({
  label,
  current,
  onFile,
}: {
  label: string;
  current?: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {current ? <img src={current} alt="" className="h-10 w-10 rounded object-cover" /> : null}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>
    </Field>
  );
}
