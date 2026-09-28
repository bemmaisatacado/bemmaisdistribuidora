ALTER TYPE public.org_capability ADD VALUE IF NOT EXISTS 'own_inventory';

DO $$ BEGIN
  CREATE TYPE public.customer_status AS ENUM ('novo','onboarding','ativo','inativo','em_risco');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.customer_relationships (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  commercial_status public.customer_status NOT NULL DEFAULT 'novo',
  account_manager_id uuid,
  origin text,
  next_action text,
  next_action_at date,
  next_action_owner_id uuid,
  customer_since timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_relationships TO authenticated;
GRANT ALL ON public.customer_relationships TO service_role;
ALTER TABLE public.customer_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform manages relationships" ON public.customer_relationships FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.customer_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'observacao' CHECK (kind IN ('ligacao','whatsapp','reuniao','observacao','followup','outro')),
  body text NOT NULL,
  author_id uuid DEFAULT auth.uid(),
  owner_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  next_action text,
  next_action_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.customer_interactions(organization_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_interactions TO authenticated;
GRANT ALL ON public.customer_interactions TO service_role;
ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform manages interactions" ON public.customer_interactions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.customer_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_id uuid,
  due_at date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.customer_followups(organization_id, status, due_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_followups TO authenticated;
GRANT ALL ON public.customer_followups TO service_role;
ALTER TABLE public.customer_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform manages followups" ON public.customer_followups FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_relationships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_interactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_followups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.customer_relationships FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.customer_interactions FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.customer_followups FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Customers = non-platform orgs holding any non-supply capability, or a relationship row
CREATE OR REPLACE FUNCTION public.is_customer_org(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM customer_relationships r WHERE r.organization_id=_org)
      OR EXISTS (SELECT 1 FROM organization_capabilities c WHERE c.organization_id=_org AND c.enabled AND c.capability::text <> 'supply_products');
$$;

CREATE OR REPLACE FUNCTION public.admin_customer_list(
  _q text DEFAULT NULL, _status text DEFAULT NULL, _commercial text DEFAULT NULL,
  _manager uuid DEFAULT NULL, _origin text DEFAULT NULL, _tag uuid DEFAULT NULL,
  _capability text DEFAULT NULL, _has_store boolean DEFAULT NULL, _store_active boolean DEFAULT NULL,
  _state text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL,
  _page int DEFAULT 1, _size int DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; qd text;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  qd := nullif(regexp_replace(coalesce(_q,''),'\D','','g'),'');
  WITH base AS (
    SELECT o.*, r.commercial_status, r.account_manager_id AS rel_manager, r.origin AS rel_origin,
      r.next_action, r.next_action_at, coalesce(r.customer_since, o.created_at) AS since,
      (SELECT coalesce(array_agg(c.capability::text), '{}') FROM organization_capabilities c WHERE c.organization_id=o.id AND c.enabled) AS caps,
      (SELECT count(*) FROM stores s WHERE s.organization_id=o.id) AS stores_count,
      (SELECT count(*) FROM stores s WHERE s.organization_id=o.id AND s.status='active') AS stores_active,
      (SELECT count(*) FROM organization_invitations i WHERE i.organization_id=o.id AND i.status='pending') AS invites_pending,
      (SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id AND m.status='active') AS members_active
    FROM organizations o LEFT JOIN customer_relationships r ON r.organization_id=o.id
    WHERE NOT o.is_platform AND is_customer_org(o.id)
  ), f AS (
    SELECT * FROM base b WHERE
      (_q IS NULL OR _q='' OR b.name ILIKE '%'||_q||'%' OR b.legal_name ILIKE '%'||_q||'%' OR b.email ILIKE '%'||_q||'%'
        OR (qd IS NOT NULL AND (regexp_replace(coalesce(b.document,''),'\D','','g') LIKE '%'||qd||'%'
          OR regexp_replace(coalesce(b.whatsapp,'')||coalesce(b.phone,''),'\D','','g') LIKE '%'||qd||'%')))
      AND (_status IS NULL OR b.status::text=_status)
      AND (_commercial IS NULL OR coalesce(b.commercial_status::text,'novo')=_commercial)
      AND (_manager IS NULL OR coalesce(b.rel_manager,b.account_manager_id)=_manager)
      AND (_origin IS NULL OR coalesce(b.rel_origin,b.origin)=_origin)
      AND (_tag IS NULL OR EXISTS (SELECT 1 FROM organization_tag_links l WHERE l.organization_id=b.id AND l.tag_id=_tag))
      AND (_capability IS NULL OR _capability = ANY(b.caps))
      AND (_has_store IS NULL OR (b.stores_count>0)=_has_store)
      AND (_store_active IS NULL OR (b.stores_active>0)=_store_active)
      AND (_state IS NULL OR b.state=_state)
      AND (_from IS NULL OR b.created_at::date>=_from) AND (_to IS NULL OR b.created_at::date<=_to)
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM f),'rows',coalesce((SELECT jsonb_agg(x) FROM (
    SELECT f.id,f.name,f.legal_name,f.document,f.email,f.whatsapp,f.city,f.state,f.status,f.logo_url,f.created_at,
      coalesce(f.commercial_status::text,'novo') AS commercial_status,
      coalesce(f.rel_manager,f.account_manager_id) AS manager_id,
      (SELECT coalesce(p.full_name,u.email) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=coalesce(f.rel_manager,f.account_manager_id)) AS manager_name,
      coalesce(f.rel_origin,f.origin) AS origin, f.next_action, f.next_action_at, f.caps, f.stores_count, f.stores_active, f.invites_pending, f.members_active
    FROM f ORDER BY f.created_at DESC OFFSET greatest(_page-1,0)*_size LIMIT _size) x),'[]'::jsonb)) INTO res;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.admin_customer_stats(_from date DEFAULT (now()-interval '30 days')::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH c AS (
    SELECT o.id,o.status,o.created_at,o.document,o.email,o.whatsapp, r.commercial_status,
      EXISTS(SELECT 1 FROM stores s WHERE s.organization_id=o.id) AS has_store,
      EXISTS(SELECT 1 FROM organization_capabilities x WHERE x.organization_id=o.id AND x.enabled AND x.capability='use_dropshipping') AS drop_on,
      EXISTS(SELECT 1 FROM organization_capabilities x WHERE x.organization_id=o.id AND x.enabled AND x.capability::text IN ('buy_wholesale','buy_mixed_wholesale','buy_closed_grade')) AS wholesale_on,
      EXISTS(SELECT 1 FROM organization_invitations i WHERE i.organization_id=o.id AND i.status='pending') AS inv,
      EXISTS(SELECT 1 FROM customer_followups f WHERE f.organization_id=o.id AND f.status='open' AND f.due_at<current_date) AS late
    FROM organizations o LEFT JOIN customer_relationships r ON r.organization_id=o.id
    WHERE NOT o.is_platform AND is_customer_org(o.id))
  SELECT jsonb_build_object(
    'total',count(*),
    'active',count(*) FILTER (WHERE status='active'),
    'new_period',count(*) FILTER (WHERE created_at::date>=_from),
    'with_store',count(*) FILTER (WHERE has_store),
    'drop',count(*) FILTER (WHERE drop_on),
    'wholesale',count(*) FILTER (WHERE wholesale_on),
    'pending',count(*) FILTER (WHERE inv OR late OR document IS NULL OR (email IS NULL AND whatsapp IS NULL)),
    'inactive',count(*) FILTER (WHERE status<>'active' OR commercial_status='inativo')
  ) INTO res FROM c;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.customer_360(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o organizations; r customer_relationships; res jsonb;
  n_members int; n_inv int; n_stores int; n_active_stores int; n_draft_stores int; n_listings int; n_products int;
  n_accounts int; recv numeric; pay numeric; last_act timestamptz; n_paid int;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO o FROM organizations WHERE id=_org;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM customer_relationships WHERE organization_id=_org;
  SELECT count(*) INTO n_members FROM organization_members WHERE organization_id=_org AND status='active';
  SELECT count(*) INTO n_inv FROM organization_invitations WHERE organization_id=_org AND status='pending';
  SELECT count(*), count(*) FILTER (WHERE status='active'), count(*) FILTER (WHERE status='draft') INTO n_stores,n_active_stores,n_draft_stores FROM stores WHERE organization_id=_org;
  SELECT count(*) INTO n_listings FROM store_listings WHERE organization_id=_org;
  SELECT count(*) INTO n_products FROM products WHERE owner_organization_id=_org;
  SELECT count(*) INTO n_accounts FROM payment_accounts WHERE organization_id=_org AND status='active';
  SELECT coalesce(sum(amount),0) INTO recv FROM receivables WHERE organization_id=_org AND status IN ('pending','available');
  SELECT coalesce(sum(amount),0) INTO pay FROM payouts WHERE organization_id=_org AND status IN ('pending','processing');
  SELECT count(*) INTO n_paid FROM payments WHERE organization_id=_org AND status='paid';
  SELECT max(occurred_at) INTO last_act FROM audit_logs WHERE organization_id=_org OR (entity_type='organizations' AND entity_id=_org::text);
  res := jsonb_build_object(
    'relationship', jsonb_build_object(
      'exists', r.organization_id IS NOT NULL,
      'since', coalesce(r.customer_since,o.created_at),
      'origin', coalesce(r.origin,o.origin),
      'manager_id', coalesce(r.account_manager_id,o.account_manager_id),
      'manager_name', (SELECT coalesce(p.full_name,u.email) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=coalesce(r.account_manager_id,o.account_manager_id)),
      'commercial_status', coalesce(r.commercial_status::text,'novo'),
      'next_action', r.next_action, 'next_action_at', r.next_action_at,
      'next_action_owner_id', r.next_action_owner_id,
      'next_action_owner_name', (SELECT coalesce(p.full_name,u.email) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=r.next_action_owner_id),
      'last_activity', last_act),
    'operation', jsonb_build_object('members',n_members,'invites_pending',n_inv,'stores',n_stores,'stores_active',n_active_stores,'stores_draft',n_draft_stores,'listings',n_listings,'products',n_products),
    'finance', jsonb_build_object('receivables_open',recv,'payouts_open',pay,'active_accounts',n_accounts,'paid_payments',n_paid),
    'journey', jsonb_build_array(
      jsonb_build_object('key','registered','done',true,'at',o.created_at),
      jsonb_build_object('key','access','done',n_members>0),
      jsonb_build_object('key','store','done',n_stores>0),
      jsonb_build_object('key','first_product','done',n_listings>0),
      jsonb_build_object('key','first_order','done',false,'future',true),
      jsonb_build_object('key','active','done',false,'future',true),
      jsonb_build_object('key','growing','done',false,'future',true)),
    'pendencies', (SELECT coalesce(jsonb_agg(p),'[]'::jsonb) FROM (
      SELECT 'access' AS key WHERE n_members=0 AND n_inv=0
      UNION ALL SELECT 'invite' WHERE n_inv>0
      UNION ALL SELECT 'no_store' WHERE n_stores=0 AND EXISTS(SELECT 1 FROM organization_capabilities WHERE organization_id=_org AND enabled AND capability='operate_store')
      UNION ALL SELECT 'store_draft' WHERE n_draft_stores>0
      UNION ALL SELECT 'no_account' WHERE n_accounts=0 AND (recv>0 OR pay>0)
      UNION ALL SELECT 'incomplete' WHERE o.document IS NULL OR (o.email IS NULL AND o.whatsapp IS NULL)
      UNION ALL SELECT 'followup_late' WHERE EXISTS(SELECT 1 FROM customer_followups WHERE organization_id=_org AND status='open' AND due_at<current_date)
      UNION ALL SELECT 'next_action_late' WHERE r.next_action_at < current_date
    ) p)
  );
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.admin_customer_queues()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'followups_late', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id, o.name, f.title AS detail, f.due_at FROM customer_followups f JOIN organizations o ON o.id=f.organization_id
      WHERE f.status='open' AND f.due_at<current_date
      UNION ALL
      SELECT o.id, o.name, r.next_action, r.next_action_at FROM customer_relationships r JOIN organizations o ON o.id=r.organization_id
      WHERE r.next_action_at<current_date AND r.next_action IS NOT NULL
      ORDER BY 4 LIMIT 50) x),'[]'::jsonb),
    'onboarding', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,r.updated_at FROM customer_relationships r JOIN organizations o ON o.id=r.organization_id
      WHERE r.commercial_status='onboarding' ORDER BY r.updated_at LIMIT 50) x),'[]'::jsonb),
    'invites_pending', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,i.email AS detail FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id
      WHERE i.status='pending' AND NOT o.is_platform ORDER BY i.created_at LIMIT 50) x),'[]'::jsonb),
    'incomplete', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name FROM organizations o WHERE NOT o.is_platform AND is_customer_org(o.id)
      AND (o.document IS NULL OR (o.email IS NULL AND o.whatsapp IS NULL)) ORDER BY o.created_at LIMIT 50) x),'[]'::jsonb),
    'stores_draft', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT o.id,o.name,s.name AS detail FROM stores s JOIN organizations o ON o.id=s.organization_id
      WHERE s.status='draft' ORDER BY s.created_at LIMIT 50) x),'[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.customer_timeline(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.at DESC) FROM (
    SELECT 'interaction' AS type, i.id::text, i.kind AS sub, i.body, i.occurred_at AS at,
      (SELECT coalesce(p.full_name,u.email) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=i.author_id) AS author,
      i.next_action, i.next_action_at
    FROM customer_interactions i WHERE i.organization_id=_org
    UNION ALL
    SELECT 'note', n.id::text, n.kind, n.body, n.created_at,
      (SELECT coalesce(p.full_name,u.email) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=n.author_id), NULL, NULL
    FROM organization_notes n WHERE n.organization_id=_org
    UNION ALL
    SELECT 'followup', f.id::text, f.status, f.title, coalesce(f.completed_at,f.created_at),
      (SELECT coalesce(p.full_name,u.email) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=coalesce(f.completed_by,f.created_by)), NULL, f.due_at
    FROM customer_followups f WHERE f.organization_id=_org
    ORDER BY 5 DESC LIMIT 200) x),'[]'::jsonb);
END $$;

-- Lock down security-definer RPCs: never callable anonymously
DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_customer_list(text,text,text,uuid,text,uuid,text,boolean,boolean,text,date,date,int,int)',
    'admin_customer_stats(date)','customer_360(uuid)','admin_customer_queues()','customer_timeline(uuid)',
    'admin_org_stats()','org_summary(uuid)','platform_team()','org_member_directory(uuid)','activate_my_invites()',
    'admin_search_organizations(text,text,text,text,boolean,boolean,date,date,uuid,integer,integer)',
    'admin_dashboard_metrics(timestamptz,timestamptz)','admin_ops_queue()','find_user_id_by_email(text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM authenticated;