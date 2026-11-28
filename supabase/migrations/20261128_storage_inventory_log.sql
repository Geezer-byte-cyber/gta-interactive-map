-- Storage inventory: grouped current contents plus an immutable movement history.
CREATE TABLE IF NOT EXISTS public.storage_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_id UUID NOT NULL REFERENCES public.storages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_weight NUMERIC(12,3) NOT NULL CHECK (unit_weight >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_id, name)
);

CREATE TABLE IF NOT EXISTS public.storage_item_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_id UUID NOT NULL REFERENCES public.storages(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.storage_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add', 'remove')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_weight NUMERIC(12,3) NOT NULL CHECK (unit_weight >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.storage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_item_movements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.storage_items, public.storage_item_movements TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.storage_items, public.storage_item_movements TO service_role;

DROP POLICY IF EXISTS storage_items_select ON public.storage_items;
CREATE POLICY storage_items_select ON public.storage_items
FOR SELECT TO authenticated
USING (public.storage_is_visible_to_current_user(storage_id));

DROP POLICY IF EXISTS storage_movements_select ON public.storage_item_movements;
CREATE POLICY storage_movements_select ON public.storage_item_movements
FOR SELECT TO authenticated
USING (public.storage_is_visible_to_current_user(storage_id));

CREATE OR REPLACE FUNCTION public.adjust_storage_item(
  p_storage_id UUID,
  p_item_name TEXT,
  p_action TEXT,
  p_quantity INTEGER,
  p_unit_weight NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $inventory$
DECLARE
  v_user UUID := auth.uid();
  v_item public.storage_items%ROWTYPE;
  v_weight NUMERIC(12,3);
  v_current_weight NUMERIC(14,3);
  v_capacity NUMERIC(14,3);
  v_delta INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.storage_is_visible_to_current_user(p_storage_id) THEN
    RAISE EXCEPTION 'You do not have access to this storage.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.user_id = v_user AND p.role = 'owner'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_module_permissions m
    WHERE m.user_id = v_user AND m.can_view_storages = TRUE AND m.can_edit_storages = TRUE
  ) THEN
    RAISE EXCEPTION 'You do not have permission to update storage contents.';
  END IF;

  IF NULLIF(TRIM(p_item_name), '') IS NULL OR p_action NOT IN ('add', 'remove')
     OR p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Enter an item name and a quantity greater than zero.';
  END IF;

  SELECT * INTO v_item
  FROM public.storage_items
  WHERE storage_id = p_storage_id AND LOWER(name) = LOWER(TRIM(p_item_name))
  FOR UPDATE;

  IF p_action = 'add' THEN
    IF v_item.id IS NULL THEN
      IF p_unit_weight IS NULL OR p_unit_weight < 0 THEN
        RAISE EXCEPTION 'Enter the weight of one item.';
      END IF;
      v_weight := ROUND(p_unit_weight, 3);
    ELSE
      v_weight := v_item.unit_weight;
      IF p_unit_weight IS NOT NULL AND ROUND(p_unit_weight, 3) <> v_weight THEN
        RAISE EXCEPTION 'This item already exists with a different unit weight. Edit the existing item weight before adding more.';
      END IF;
    END IF;

    SELECT COALESCE(SUM(quantity * unit_weight), 0) INTO v_current_weight
    FROM public.storage_items WHERE storage_id = p_storage_id;

    SELECT capacity INTO v_capacity FROM public.storages WHERE id = p_storage_id;
    IF v_current_weight + (p_quantity * v_weight) > v_capacity THEN
      RAISE EXCEPTION 'Not enough capacity. Available: %', GREATEST(v_capacity - v_current_weight, 0);
    END IF;

    IF v_item.id IS NULL THEN
      INSERT INTO public.storage_items(storage_id, name, quantity, unit_weight)
      VALUES (p_storage_id, TRIM(p_item_name), p_quantity, v_weight)
      RETURNING * INTO v_item;
    ELSE
      UPDATE public.storage_items
      SET quantity = quantity + p_quantity, updated_at = NOW()
      WHERE id = v_item.id RETURNING * INTO v_item;
    END IF;
  ELSE
    IF v_item.id IS NULL OR v_item.quantity < p_quantity THEN
      RAISE EXCEPTION 'There are not enough of this item in the storage.';
    END IF;
    v_weight := v_item.unit_weight;
    IF v_item.quantity = p_quantity THEN
      DELETE FROM public.storage_items WHERE id = v_item.id;
    ELSE
      UPDATE public.storage_items
      SET quantity = quantity - p_quantity, updated_at = NOW()
      WHERE id = v_item.id RETURNING * INTO v_item;
    END IF;
  END IF;

  INSERT INTO public.storage_item_movements(storage_id, item_id, item_name, action, quantity, unit_weight, created_by)
  VALUES (p_storage_id, v_item.id, TRIM(p_item_name), p_action, p_quantity, v_weight, v_user);

  RETURN jsonb_build_object('success', TRUE);
END;
$inventory$;

GRANT EXECUTE ON FUNCTION public.adjust_storage_item(UUID, TEXT, TEXT, INTEGER, NUMERIC) TO authenticated;
