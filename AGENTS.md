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
- Catalog: products/product_variants are master identity; supplier_offers/supplier_offer_variants hold supplier cost & modalities — never mix cost into products.
- Only the platform can approve/publish offers/products (guard_review_status trigger) — review is enforced in SQL.
- BemMais margin is resolved only by SQL resolve_platform_price over pricing_rules (platform-only) — never compute critical prices in the frontend.
- Inventory = append-only inventory_movements + inventory_balances view — auditable history instead of a mutable quantity.
- Finance separates payments / payment_allocations / receivables / payouts / immutable ledger_entries; corrections are reversal entries — marketplace split + Pix payouts.
- AI calls go through src/lib/ai/gateway.server.ts with provider adapters; keys only in server secrets, usage logs hold metadata only.
- Super Admin lives under src/routes/_authenticated/admin/*; future modules route to the admin splat page — no invented data.
- Architecture reference: docs/ARCHITECTURE.md.
