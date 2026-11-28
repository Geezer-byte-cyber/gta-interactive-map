-- Catalogue visibility is category-based only.
-- Knox accounts with module access see all categories; customers see only assigned categories.
DROP POLICY IF EXISTS catalogue_items_select ON public.catalogue_items;
DROP POLICY IF EXISTS catalogue_categories_select ON public.catalogue_categories;

DROP FUNCTION IF EXISTS public.catalogue_item_visible_to_current_user(UUID);
DROP TABLE IF EXISTS public.catalogue_item_access;

CREATE POLICY catalogue_categories_select ON public.catalogue_categories
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'owner'
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles p
    JOIN public.user_module_permissions mp ON mp.user_id = p.user_id
    WHERE p.user_id = auth.uid()
      AND p.account_type = 'knox'
      AND mp.can_view_catalogue = TRUE
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.user_module_permissions mp
      WHERE mp.user_id = auth.uid() AND mp.can_view_catalogue = TRUE
    )
    AND EXISTS (
      SELECT 1 FROM public.catalogue_category_permissions cp
      WHERE cp.category_id = catalogue_categories.id
        AND cp.user_id = auth.uid()
    )
  )
);

CREATE POLICY catalogue_items_select ON public.catalogue_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'owner'
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles p
    JOIN public.user_module_permissions mp ON mp.user_id = p.user_id
    WHERE p.user_id = auth.uid()
      AND p.account_type = 'knox'
      AND mp.can_view_catalogue = TRUE
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.user_module_permissions mp
      WHERE mp.user_id = auth.uid() AND mp.can_view_catalogue = TRUE
    )
    AND EXISTS (
      SELECT 1
      FROM public.catalogue_category_permissions cp
      WHERE cp.category_id = catalogue_items.category_id
        AND cp.user_id = auth.uid()
    )
  )
);
