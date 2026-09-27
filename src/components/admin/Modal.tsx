import type { ReactNode, FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, ErrorNote } from "./ui";

export function FormModal({ open, onOpenChange, title, children, onSubmit, submitting, error, submitLabel = "Salvar" }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode;
  onSubmit: () => void; submitting?: boolean; error?: unknown; submitLabel?: string;
}) {
  function handle(e: FormEvent) { e.preventDefault(); onSubmit(); }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handle} className="grid gap-3">
          {children}
          <ErrorNote error={error} />
          <div className="mt-2 flex justify-end gap-2">
            <Btn type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={submitting}>{submitting ? "Salvando..." : submitLabel}</Btn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
