-- Store the username on each inventory movement so the log can show who made it.
ALTER TABLE public.storage_item_movements
  ADD COLUMN IF NOT EXISTS logged_by_username TEXT;

UPDATE public.storage_item_movements movement
SET logged_by_username = profile.username
FROM public.user_profiles profile
WHERE movement.created_by = profile.user_id
  AND movement.logged_by_username IS NULL;

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
  v_username TEXT;
  v_item public.storage_items%ROWTYPE;
  v_weight INTEGER;
  v_current_weight NUMERIC(14,0);
  v_capacity NUMERIC(14,0);
BEGIN
  IF v_user IS NULL OR NOT public.storage_is_visible_to_current_user(p_storage_id) THEN
    RAISE EXCEPTION 'You do not have access to this storage.';
  END IF;

  SELECT username INTO v_username
  FROM public.user_profiles
  WHERE user_id = v_user;

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
      IF p_unit_weight IS NULL OR p_unit_weight < 0 OR p_unit_weight <> TRUNC(p_unit_weight) THEN
        RAISE EXCEPTION 'Enter a whole-number weight for one item.';
      END IF;
      v_weight := p_unit_weight::INTEGER;
    ELSE
      v_weight := v_item.unit_weight;
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
      v_item.id := NULL;
    ELSE
      UPDATE public.storage_items
      SET quantity = quantity - p_quantity, updated_at = NOW()
      WHERE id = v_item.id RETURNING * INTO v_item;
    END IF;
  END IF;

  INSERT INTO public.storage_item_movements(storage_id, item_id, item_name, action, quantity, unit_weight, created_by, logged_by_username)
  VALUES (p_storage_id, v_item.id, TRIM(p_item_name), p_action, p_quantity, v_weight, v_user, COALESCE(v_username, 'Unknown user'));

  RETURN jsonb_build_object('success', TRUE);
END;
$inventory$;

GRANT EXECUTE ON FUNCTION public.adjust_storage_item(UUID, TEXT, TEXT, INTEGER, NUMERIC) TO authenticated;
