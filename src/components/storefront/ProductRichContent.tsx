type ContentValue =
  string | boolean | string[] | Record<string, unknown> | Record<string, unknown>[];
type Block = { id: string; type: string; config: Record<string, ContentValue> };
const safeHref = (href?: string) =>
  href && (/^https?:\/\//.test(href) || href.startsWith("/")) ? href : undefined;
export function ProductRichContent({ blocks }: { blocks?: Block[] }) {
  if (!blocks?.length) return null;
  return (
    <section className="mx-auto mt-14 max-w-5xl space-y-8 border-t border-slate-200 pt-10">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} />
      ))}
    </section>
  );
}
function BlockView({ block: b }: { block: Block }) {
  const c = b.config || {};
  const image = (src?: string) =>
    src ? (
      <img
        loading="lazy"
        src={src}
        alt={c.alt || ""}
        className="h-full w-full rounded-2xl object-cover"
      />
    ) : null;
  if (b.type === "text")
    return (
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold">{c.title}</h2>
        {c.subtitle && <p className="mt-2 text-slate-500">{c.subtitle}</p>}
        <p className="mt-4 whitespace-pre-line leading-7 text-slate-700">{c.text}</p>
      </div>
    );
  if (b.type === "image" || b.type === "banner")
    return (
      <div>
        {safeHref(c.link) ? <a href={safeHref(c.link)}>{image(c.image)}</a> : image(c.image)}
      </div>
    );
  if (b.type === "image_text")
    return (
      <div
        className={`grid items-center gap-8 md:grid-cols-2 ${c.reverse ? "md:[&>*:first-child]:order-2" : ""}`}
      >
        <div>{image(c.image)}</div>
        <div>
          <h2 className="text-2xl font-bold">{c.title}</h2>
          <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">{c.text}</p>
        </div>
      </div>
    );
  if (b.type === "two_images")
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {image(c.left_image)}
        {image(c.right_image)}
      </div>
    );
  if (b.type === "benefits")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {((c.items as Record<string, unknown>[]) || []).map((x, i: number) => (
          <div key={i} className="rounded-xl bg-stone-100 p-5">
            <b>{x.title || x}</b>
            {x.text && <p className="mt-1 text-sm text-slate-600">{x.text}</p>}
          </div>
        ))}
      </div>
    );
  if (b.type === "faq")
    return (
      <div>
        {((c.items as Record<string, unknown>[]) || []).map((x, i: number) => (
          <details key={i} className="border-b py-4">
            <summary className="cursor-pointer font-semibold">{x.question}</summary>
            <p className="mt-3 whitespace-pre-line text-slate-600">{x.answer}</p>
          </details>
        ))}
      </div>
    );
  if (b.type === "size_guide")
    return (
      <div className="overflow-x-auto">
        <h2 className="mb-3 text-xl font-bold">{c.title || "Guia de medidas"}</h2>
        <table className="w-full text-left text-sm">
          <tbody>
            {(c.rows || []).map((r: string[], i: number) => (
              <tr key={i} className="border-b">
                {r.map((v, j) => (
                  <td key={j} className="p-3">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return b.type === "spacer" ? <div className="h-6" /> : null;
}
