import { MODALITY_SHORT } from "@/lib/admin/suppliers";

export function ModChips({ mods }: { mods: string[] }) {
  const shown = mods.filter((m) => MODALITY_SHORT[m]);
  if (!shown.length) return <span className="text-xs text-muted-foreground">Sem modalidades</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((m) => (
        <span
          key={m}
          className="rounded-md bg-surface-dark px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-foreground"
        >
          {MODALITY_SHORT[m]}
        </span>
      ))}
    </div>
  );
}
