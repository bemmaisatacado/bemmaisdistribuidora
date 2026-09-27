import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(160),
  fullName: z.string().trim().max(120).optional(),
  roleKey: z.enum(["org_owner", "org_manager", "org_operator", "org_viewer"]),
  redirectTo: z.string().url().max(300),
});

/**
 * Secure member invite: the caller's permission is checked as the caller (RLS/RPC),
 * then Supabase Auth sends the invitation e-mail. No password is ever set by an admin.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: permErr } = await context.supabase.rpc("has_org_permission", {
      _uid: context.userId, _org: data.organizationId, _perm: "members.manage",
    });
    if (permErr) throw new Error("Não foi possível verificar sua permissão.");
    if (!allowed) throw new Error("Você não tem permissão para gerenciar membros desta empresa.");

    const origin = new URL(data.redirectTo).origin;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existingId, error: findErr } = await supabaseAdmin.rpc("find_user_id_by_email", { _email: data.email });
    if (findErr) throw new Error("Falha ao consultar usuário.");

    let userId = existingId as string | null;
    let status: "active" | "invited" = "active";
    if (!userId) {
      const { data: inv, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: `${origin}/entrar`,
        data: data.fullName ? { full_name: data.fullName } : {},
      });
      if (invErr || !inv.user) throw new Error(invErr?.message ?? "Falha ao enviar convite.");
      userId = inv.user.id;
      status = "invited";
    }

    // Insert as the caller so RLS + guard triggers + audit apply with the real actor.
    const { error: memErr } = await context.supabase.from("organization_members").insert({
      organization_id: data.organizationId, user_id: userId, role_key: data.roleKey, status,
    });
    if (memErr) {
      if (memErr.code === "23505") throw new Error("Essa pessoa já é membro desta empresa.");
      throw new Error(memErr.message);
    }

    await supabaseAdmin.from("organization_invitations").insert({
      organization_id: data.organizationId, email: data.email, role_key: data.roleKey, user_id: userId,
      status: status === "invited" ? "sent" : "accepted", invited_by: context.userId,
    });

    return { status };
  });
