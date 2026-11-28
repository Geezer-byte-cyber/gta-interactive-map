-- Fix catalogue item visibility management privileges without weakening row-level security.
-- The app may attempt to clear and replace item access rows, but only owners pass the RLS policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_item_access TO authenticated;

-- Evaluate item visibility without exposing other users' access rows through invoker RLS.
CREATE OR REPLACE FUNCTION public.catalogue_item_visible_to_current_user(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.catalogue_item_access ia
      WHERE ia.item_id = p_item_id
    )
    OR EXISTS (
      SELECT 1 FROM public.catalogue_item_access ia
      WHERE ia.item_id = p_item_id AND ia.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'owner'
    );
$$;

REVOKE ALL ON FUNCTION public.catalogue_item_visible_to_current_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogue_item_visible_to_current_user(UUID) TO authenticated;

DROP POLICY IF EXISTS catalogue_items_select ON public.catalogue_items;
CREATE POLICY catalogue_items_select ON public.catalogue_items
FOR SELECT TO authenticated
USING (
  (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.catalogue_category_permissions cp
      WHERE cp.category_id = catalogue_items.category_id
        AND cp.user_id = auth.uid()
    )
  )
  AND public.catalogue_item_visible_to_current_user(catalogue_items.id)
);
