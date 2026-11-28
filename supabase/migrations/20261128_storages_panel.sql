-- Storages panel: module permissions plus per-storage visibility assignments.
ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS can_view_storages BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_add_storages BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_edit_storages BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_delete_storages BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.storages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('container', 'safe')),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  pincode TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.storage_user_access (
  storage_id UUID NOT NULL REFERENCES public.storages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (storage_id, user_id)
);

ALTER TABLE public.storages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_user_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.storage_user_access TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.storages TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.storage_user_access TO service_role;

CREATE OR REPLACE FUNCTION public.storage_is_visible_to_current_user(storage_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles p
      JOIN public.user_module_permissions m ON m.user_id = p.user_id
      JOIN public.storage_user_access a ON a.user_id = p.user_id
      WHERE p.user_id = auth.uid()
        AND p.role <> 'owner'
        AND p.account_type = 'knox'
        AND m.can_view_storages = TRUE
        AND a.storage_id = storage_uuid
    );
$$;

DROP POLICY IF EXISTS storages_select ON public.storages;
CREATE POLICY storages_select ON public.storages
FOR SELECT TO authenticated
USING (public.storage_is_visible_to_current_user(id));

DROP POLICY IF EXISTS storages_insert ON public.storages;
CREATE POLICY storages_insert ON public.storages
FOR INSERT TO authenticated
WITH CHECK (
  (created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_profiles p
    JOIN public.user_module_permissions m ON m.user_id = p.user_id
    WHERE p.user_id = auth.uid() AND p.role <> 'owner'
      AND p.account_type = 'knox'
      AND m.can_view_storages = TRUE AND m.can_add_storages = TRUE
  ))
  OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
);

DROP POLICY IF EXISTS storages_update ON public.storages;
CREATE POLICY storages_update ON public.storages
FOR UPDATE TO authenticated
USING (
  public.storage_is_visible_to_current_user(id)
  AND (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
    OR EXISTS (
      SELECT 1 FROM public.user_module_permissions m
      WHERE m.user_id = auth.uid() AND m.can_view_storages = TRUE AND m.can_edit_storages = TRUE
    )
  )
)
WITH CHECK (
  public.storage_is_visible_to_current_user(id)
  AND (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
    OR EXISTS (
      SELECT 1 FROM public.user_module_permissions m
      WHERE m.user_id = auth.uid() AND m.can_view_storages = TRUE AND m.can_edit_storages = TRUE
    )
  )
);

DROP POLICY IF EXISTS storages_delete ON public.storages;
CREATE POLICY storages_delete ON public.storages
FOR DELETE TO authenticated
USING (
  public.storage_is_visible_to_current_user(id)
  AND (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
    OR EXISTS (
      SELECT 1 FROM public.user_module_permissions m
      WHERE m.user_id = auth.uid() AND m.can_view_storages = TRUE AND m.can_delete_storages = TRUE
    )
  )
);

DROP POLICY IF EXISTS storage_user_access_select ON public.storage_user_access;
CREATE POLICY storage_user_access_select ON public.storage_user_access
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
);

DROP POLICY IF EXISTS storage_user_access_insert ON public.storage_user_access;
CREATE POLICY storage_user_access_insert ON public.storage_user_access
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
  OR (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.storages s
      JOIN public.user_module_permissions m ON m.user_id = auth.uid()
      JOIN public.user_profiles p ON p.user_id = auth.uid()
      WHERE s.id = storage_id AND s.created_by = auth.uid()
        AND p.account_type = 'knox'
        AND m.can_view_storages = TRUE AND m.can_add_storages = TRUE
    )
  )
);

DROP POLICY IF EXISTS storage_user_access_delete ON public.storage_user_access;
CREATE POLICY storage_user_access_delete ON public.storage_user_access
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND p.role = 'owner')
);
