import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { ErrorNote } from "@/components/admin/ui";
import { ORG_STATUS_HELP, ORG_STATUS_LABEL, type OrgStatus } from "@/lib/admin/orgs";

/** Confirmed status change. Status never deletes data; the audit trigger records the change. */
export function StatusDialog({
  org,
  target,
  onClose,
}: {
  org: { id: string; name: string };
  target: OrgStatus | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (status: OrgStatus) => {
      const { error } = await supabase.from("organizations").update({ status }).eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgs"] });
      qc.invalidateQueries({ queryKey: ["org"] });
      qc.invalidateQueries({ queryKey: ["org-stats"] });
      onClose();
    },
  });
  const danger = target === "suspended" || target === "blocked" || target === "archived";
  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Alterar status para “{target ? ORG_STATUS_LABEL[target] : ""}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <b className="text-foreground">{org.name}</b> — {target ? ORG_STATUS_HELP[target] : ""}{" "}
            A alteração fica registrada na auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorNote error={m.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={m.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={m.isPending}
            className={danger ? "bg-danger text-primary-foreground hover:bg-danger/90" : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (target) m.mutate(target);
            }}
          >
            {m.isPending ? "Salvando..." : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
