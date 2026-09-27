<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Multi-tenant: organizations + organization_members(role_key) + role_permissions + organization_capabilities; the platform is the single organization with is_platform=true — never check company names in code.
- Access checks live in SQL helpers is_platform_admin / is_org_member / has_org_permission used by RLS — security must not depend on the frontend.
- audit_logs is append-only, written only by the audit_row_change trigger.
- First user to sign up becomes platform_super_admin (handle_new_user bootstrap).
