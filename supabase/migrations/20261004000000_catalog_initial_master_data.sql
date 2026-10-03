-- Initial reusable catalog master data. This seed intentionally creates no products, variants or commercial relationships.
DO $$
DECLARE
  root_calcados uuid; root_vestuario uuid; root_acessorios uuid; category_id uuid; seed record;
  normalized_name text;
BEGIN
  -- Brands are found by the same trimmed/case-insensitive normalization used by quick creation.
  FOREACH normalized_name IN ARRAY ARRAY['Nike','Adidas','New Balance','Asics','Vans','Puma','Fila','Mizuno','Olympikus','Reebok','Converse','Under Armour'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.brands b WHERE lower(regexp_replace(btrim(b.name), '\s+', ' ', 'g')) = lower(normalized_name)) THEN
      INSERT INTO public.brands(name, slug, is_active) VALUES (normalized_name, lower(replace(normalized_name, ' ', '-')), true);
    END IF;
  END LOOP;

  -- Root categories and children are identified by normalized name plus parent, not only by slug.
  SELECT id INTO root_calcados FROM public.categories WHERE parent_id IS NULL AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))='calçados' LIMIT 1;
  IF root_calcados IS NULL THEN INSERT INTO public.categories(name,slug,sort_order) VALUES ('Calçados','calcados',10) RETURNING id INTO root_calcados; END IF;
  SELECT id INTO root_vestuario FROM public.categories WHERE parent_id IS NULL AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))='vestuário' LIMIT 1;
  IF root_vestuario IS NULL THEN INSERT INTO public.categories(name,slug,sort_order) VALUES ('Vestuário','vestuario',20) RETURNING id INTO root_vestuario; END IF;
  SELECT id INTO root_acessorios FROM public.categories WHERE parent_id IS NULL AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))='acessórios' LIMIT 1;
  IF root_acessorios IS NULL THEN INSERT INTO public.categories(name,slug,sort_order) VALUES ('Acessórios','acessorios',30) RETURNING id INTO root_acessorios; END IF;

  FOR seed IN SELECT * FROM (VALUES
    (root_calcados,'Tênis','calcados-tenis',10),(root_calcados,'Sapatos','calcados-sapatos',20),(root_calcados,'Sandálias','calcados-sandalias',30),(root_calcados,'Chinelos','calcados-chinelos',40),(root_calcados,'Botas','calcados-botas',50),(root_calcados,'Sapatilhas','calcados-sapatilhas',60),
    (root_vestuario,'Camisetas','vestuario-camisetas',10),(root_vestuario,'Camisas','vestuario-camisas',20),(root_vestuario,'Calças','vestuario-calcas',30),(root_vestuario,'Shorts','vestuario-shorts',40),(root_vestuario,'Bermudas','vestuario-bermudas',50),(root_vestuario,'Moletons','vestuario-moletons',60),(root_vestuario,'Jaquetas','vestuario-jaquetas',70),(root_vestuario,'Vestidos','vestuario-vestidos',80),(root_vestuario,'Saias','vestuario-saias',90),(root_vestuario,'Conjuntos','vestuario-conjuntos',100),
    (root_acessorios,'Bonés','acessorios-bones',10),(root_acessorios,'Bolsas','acessorios-bolsas',20),(root_acessorios,'Mochilas','acessorios-mochilas',30),(root_acessorios,'Carteiras','acessorios-carteiras',40),(root_acessorios,'Cintos','acessorios-cintos',50),(root_acessorios,'Meias','acessorios-meias',60)
  ) AS rows(parent_id,name,slug,sort_order) LOOP
    SELECT id INTO category_id FROM public.categories WHERE parent_id=seed.parent_id AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))=lower(seed.name) LIMIT 1;
    IF category_id IS NULL THEN INSERT INTO public.categories(parent_id,name,slug,sort_order) VALUES (seed.parent_id,seed.name,seed.slug,seed.sort_order); END IF;
  END LOOP;

  -- Footwear: select only the applicable options per future product; the seed never creates combinations.
  FOR category_id IN SELECT id FROM public.categories WHERE parent_id=root_calcados LOOP
    INSERT INTO public.category_attributes(category_id,name,code,type,options,is_required,is_variant,sort_order) VALUES
      (category_id,'Tamanho','tamanho','select','["33","34","35","36","37","38","39","40","41","42","43","44","45","46"]'::jsonb,true,true,10),
      (category_id,'Cor','cor','color','["Preto","Branco","Cinza","Bege","Marrom","Azul","Azul-marinho","Verde","Vermelho","Rosa","Roxo","Amarelo","Laranja","Off-white","Caramelo"]'::jsonb,true,true,20)
    ON CONFLICT (category_id,code) DO NOTHING;
  END LOOP;
  SELECT id INTO category_id FROM public.categories WHERE parent_id=root_calcados AND lower(name)='tênis' LIMIT 1;
  INSERT INTO public.category_attributes(category_id,name,code,type,options,is_required,is_variant,sort_order) VALUES
    (category_id,'Material','material','text','[]'::jsonb,false,false,30)
  ON CONFLICT (category_id,code) DO NOTHING;

  -- Apparel uses its own alphabetic size scale and the reusable color vocabulary.
  FOR category_id IN SELECT id FROM public.categories WHERE parent_id=root_vestuario LOOP
    INSERT INTO public.category_attributes(category_id,name,code,type,options,is_required,is_variant,sort_order) VALUES
      (category_id,'Tamanho','tamanho','select','["PP","P","M","G","GG","XG","XGG"]'::jsonb,true,true,10),
      (category_id,'Cor','cor','color','["Preto","Branco","Cinza","Bege","Marrom","Azul","Azul-marinho","Verde","Vermelho","Rosa","Roxo","Amarelo","Laranja","Off-white","Caramelo"]'::jsonb,true,true,20)
    ON CONFLICT (category_id,code) DO NOTHING;
  END LOOP;

  -- Accessories remain flexible: only attributes that naturally vary are axes.
  FOR category_id IN SELECT id FROM public.categories WHERE parent_id=root_acessorios AND lower(name) IN ('bonés','bolsas','mochilas','carteiras') LOOP
    INSERT INTO public.category_attributes(category_id,name,code,type,options,is_required,is_variant,sort_order) VALUES
      (category_id,'Cor','cor','color','["Preto","Branco","Cinza","Bege","Marrom","Azul","Azul-marinho","Verde","Vermelho","Rosa","Roxo","Amarelo","Laranja","Off-white","Caramelo"]'::jsonb,true,true,10)
    ON CONFLICT (category_id,code) DO NOTHING;
  END LOOP;
  FOR category_id IN SELECT id FROM public.categories WHERE parent_id=root_acessorios AND lower(name) IN ('cintos','meias') LOOP
    INSERT INTO public.category_attributes(category_id,name,code,type,options,is_required,is_variant,sort_order) VALUES
      (category_id,'Tamanho','tamanho','select','["PP","P","M","G","GG","XG","XGG"]'::jsonb,true,true,10),
      (category_id,'Cor','cor','color','["Preto","Branco","Cinza","Bege","Marrom","Azul","Azul-marinho","Verde","Vermelho","Rosa","Roxo","Amarelo","Laranja","Off-white","Caramelo"]'::jsonb,true,true,20)
    ON CONFLICT (category_id,code) DO NOTHING;
  END LOOP;
END $$;
