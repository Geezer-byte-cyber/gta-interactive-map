-- Separate price catalogue with category-level permissions and per-account item visibility.
CREATE TABLE IF NOT EXISTS public.catalogue_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.catalogue_category_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.catalogue_categories(id) ON DELETE CASCADE,
  can_add BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, category_id)
);
CREATE TABLE IF NOT EXISTS public.catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.catalogue_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- An item with no rows here is visible to everyone who can view its category.
-- Once assigned rows exist, it is visible only to the listed accounts.
CREATE TABLE IF NOT EXISTS public.catalogue_item_access (
  item_id UUID NOT NULL REFERENCES public.catalogue_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS catalogue_items_category_idx ON public.catalogue_items(category_id);
CREATE INDEX IF NOT EXISTS catalogue_item_access_user_idx ON public.catalogue_item_access(user_id);

ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS can_view_catalogue BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.catalogue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_category_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_item_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_categories TO authenticated;
GRANT SELECT ON public.catalogue_category_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_items TO authenticated;
GRANT SELECT ON public.catalogue_item_access TO authenticated;
GRANT ALL ON public.catalogue_categories, public.catalogue_category_permissions, public.catalogue_items, public.catalogue_item_access TO service_role;

DROP POLICY IF EXISTS catalogue_categories_select ON public.catalogue_categories;
CREATE POLICY catalogue_categories_select ON public.catalogue_categories FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  OR EXISTS (SELECT 1 FROM public.catalogue_category_permissions cp WHERE cp.category_id = id AND cp.user_id = auth.uid())
);
DROP POLICY IF EXISTS catalogue_categories_owner_write ON public.catalogue_categories;
CREATE POLICY catalogue_categories_owner_write ON public.catalogue_categories FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'));

DROP POLICY IF EXISTS catalogue_category_permissions_self_read ON public.catalogue_category_permissions;
CREATE POLICY catalogue_category_permissions_self_read ON public.catalogue_category_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'));

DROP POLICY IF EXISTS catalogue_items_select ON public.catalogue_items;
CREATE POLICY catalogue_items_select ON public.catalogue_items FOR SELECT TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
   OR EXISTS (SELECT 1 FROM public.catalogue_category_permissions cp WHERE cp.category_id = catalogue_items.category_id AND cp.user_id = auth.uid()))
  AND (
    NOT EXISTS (SELECT 1 FROM public.catalogue_item_access ia WHERE ia.item_id = catalogue_items.id)
    OR EXISTS (SELECT 1 FROM public.catalogue_item_access ia WHERE ia.item_id = catalogue_items.id AND ia.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  )
);
DROP POLICY IF EXISTS catalogue_items_insert ON public.catalogue_items;
CREATE POLICY catalogue_items_insert ON public.catalogue_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  OR EXISTS (SELECT 1 FROM public.catalogue_category_permissions cp WHERE cp.category_id = catalogue_items.category_id AND cp.user_id = auth.uid() AND cp.can_add)
);
DROP POLICY IF EXISTS catalogue_items_update ON public.catalogue_items;
CREATE POLICY catalogue_items_update ON public.catalogue_items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  OR EXISTS (SELECT 1 FROM public.catalogue_category_permissions cp WHERE cp.category_id = catalogue_items.category_id AND cp.user_id = auth.uid() AND cp.can_edit)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  OR EXISTS (SELECT 1 FROM public.catalogue_category_permissions cp WHERE cp.category_id = catalogue_items.category_id AND cp.user_id = auth.uid() AND cp.can_edit)
);
DROP POLICY IF EXISTS catalogue_items_delete ON public.catalogue_items;
CREATE POLICY catalogue_items_delete ON public.catalogue_items FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  OR EXISTS (SELECT 1 FROM public.catalogue_category_permissions cp WHERE cp.category_id = catalogue_items.category_id AND cp.user_id = auth.uid() AND cp.can_delete)
);
DROP POLICY IF EXISTS catalogue_item_access_self_read ON public.catalogue_item_access;
CREATE POLICY catalogue_item_access_self_read ON public.catalogue_item_access FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'));

DROP POLICY IF EXISTS catalogue_item_access_owner_write ON public.catalogue_item_access;
CREATE POLICY catalogue_item_access_owner_write ON public.catalogue_item_access FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner'));
