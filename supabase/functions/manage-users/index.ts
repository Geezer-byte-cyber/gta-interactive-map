
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function fail(message: string, status = 400) {
  return respond({ error: message }, status);
}

function validUsername(username: string) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      console.error("Missing required function secrets");
      return fail("Server configuration is incomplete", 500);
    }

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return fail("Invalid request body");
    }

    const action = String(body.action || "");

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // PUBLIC USERNAME LOGIN
    if (action === "login") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!validUsername(username) || !password) {
        return fail("Invalid username or password", 401);
      }

      const { data: profile, error: profileError } = await admin
        .from("user_profiles")
        .select("user_id")
        .eq("username", username)
        .maybeSingle();

      if (profileError || !profile) {
        console.error("Username lookup failed:", profileError?.message);
        return fail("Invalid username or password", 401);
      }

      const { data: authUser, error: authUserError } =
        await admin.auth.admin.getUserById(profile.user_id);

      const email = authUser?.user?.email;

      if (authUserError || !email) {
        console.error("Auth user lookup failed:", authUserError?.message);
        return fail("Invalid username or password", 401);
      }

      const loginClient = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data: loginData, error: loginError } =
        await loginClient.auth.signInWithPassword({ email, password });

      if (loginError || !loginData.session) {
        console.error("Login failed:", loginError?.message);
        return fail("Invalid username or password", 401);
      }

      return respond({
        success: true,
        session: loginData.session,
      });
    }

    // ALL ADMIN ACTIONS REQUIRE A VALID OWNER SESSION
    const authorization = req.headers.get("Authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

    if (!tokenMatch) {
      return fail("Not authorised", 401);
    }

    const accessToken = tokenMatch[1];

    const userClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // IMPORTANT: explicitly pass the incoming access token
    const { data: authData, error: authError } =
      await userClient.auth.getUser(accessToken);

    if (authError || !authData.user) {
      console.error("Token verification failed:", authError?.message);
      return fail("Not authorised", 401);
    }

    const { data: ownerProfile, error: ownerError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (ownerError) {
      console.error("Owner lookup failed:", ownerError.message);
      return fail("Could not verify account permissions", 500);
    }

    if (ownerProfile?.role !== "owner") {
      return fail("Only the owner can perform this action", 403);
    }

    // CREATE USER
    if (action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!validUsername(username)) {
        return fail(
          "Username must be 3–24 characters: letters, numbers or underscores"
        );
      }

      if (password.length < 10) {
        return fail("Password must be at least 10 characters");
      }

      const email = `${username}@users.knoxmap.invalid`;

      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

      if (createError || !created.user) {
        return fail(createError?.message || "Could not create account");
      }

      const { error: profileError } = await admin
        .from("user_profiles")
        .insert({
          user_id: created.user.id,
          username,
          role: "user",
        });

      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return fail(profileError.message);
      }

      return respond({ success: true, userId: created.user.id });
    }

    // LIST USERS, CATEGORIES AND PERMISSIONS
    if (action === "list") {
      const [profilesResult, categoriesResult, permissionsResult] =
        await Promise.all([
          admin
            .from("user_profiles")
            .select("user_id, username, role, created_at")
            .order("username"),
          admin
            .from("map_categories")
            .select("id, name, color")
            .order("name"),
          admin
            .from("user_category_permissions")
            .select("user_id, category_id, can_add, can_edit, can_delete"),
        ]);

      if (profilesResult.error) {
        console.error("Profiles query failed:", profilesResult.error.message);
        return fail("Could not load users", 500);
      }

      if (categoriesResult.error) {
        console.error("Categories query failed:", categoriesResult.error.message);
        return fail("Could not load categories", 500);
      }

      if (permissionsResult.error) {
        console.error("Permissions query failed:", permissionsResult.error.message);
        return fail("Could not load permissions", 500);
      }

      const users = (profilesResult.data || []).map((profile) => ({
        ...profile,
        permissions: (categoriesResult.data || []).map((category) => {
          const permission = (permissionsResult.data || []).find(
            (item) =>
              item.user_id === profile.user_id &&
              item.category_id === category.id
          );

          const isOwner = profile.role === "owner";

          return {
            categoryId: category.id,
            categoryName: category.name,
            canView: isOwner || !!permission,
            canAdd: isOwner || !!permission?.can_add,
            canEdit: isOwner || !!permission?.can_edit,
            canDelete: isOwner || !!permission?.can_delete,
          };
        }),
      }));

      return respond({
        success: true,
        users,
        categories: categoriesResult.data || [],
      });
    }

    // UPDATE CATEGORY PERMISSIONS
    if (action === "updatePermissions") {
      const userId = String(body.userId || "");
      const permissions = Array.isArray(body.permissions)
        ? body.permissions as Array<Record<string, unknown>>
        : [];

      if (!userId) return fail("Missing user ID");

      const { data: target, error: targetError } = await admin
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (targetError || !target) {
        return fail("User not found", 404);
      }

      if (target.role === "owner") {
        return fail("Owner permissions cannot be changed");
      }

      const { data: categories, error: categoriesError } = await admin
        .from("map_categories")
        .select("id");

      if (categoriesError) {
        return fail("Could not load categories", 500);
      }

      const validIds = new Set((categories || []).map((c) => c.id));
      const rows = [];

      for (const item of permissions) {
        const categoryId = String(item.categoryId || "");

        if (!validIds.has(categoryId)) {
          return fail("One of the selected categories is invalid");
        }

        const canView = item.canView === true;
        const canAdd = item.canAdd === true;
        const canEdit = item.canEdit === true;
        const canDelete = item.canDelete === true;

        if ((canAdd || canEdit || canDelete) && !canView) {
          return fail("Add, edit and delete permissions require view permission");
        }

        if (canView) {
          rows.push({
            user_id: userId,
            category_id: categoryId,
            can_add: canAdd,
            can_edit: canEdit,
            can_delete: canDelete,
          });
        }
      }

      const { error: deleteError } = await admin
        .from("user_category_permissions")
        .delete()
        .eq("user_id", userId);

      if (deleteError) {
        return fail("Could not update existing permissions", 500);
      }

      if (rows.length) {
        const { error: insertError } = await admin
          .from("user_category_permissions")
          .insert(rows);

        if (insertError) {
          return fail("Could not save permissions", 500);
        }
      }

      return respond({ success: true });
    }

    // CHANGE USER PASSWORD
    if (action === "updatePassword") {
      const userId = String(body.userId || "");
      const password = String(body.password || "");

      if (!userId) return fail("Missing user ID");

      if (password.length < 10) {
        return fail("Password must be at least 10 characters");
      }

      const { data: target, error: targetError } = await admin
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (targetError || !target) {
        return fail("User not found", 404);
      }

      if (target.role === "owner") {
        return fail("The owner password cannot be changed here");
      }

      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
      });

      if (error) return fail(error.message);

      return respond({ success: true });
    }

    // DELETE USER
    if (action === "delete") {
      const userId = String(body.userId || "");

      if (!userId || userId === authData.user.id) {
        return fail("You cannot delete your own owner account");
      }

      const { data: target, error: targetError } = await admin
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (targetError || !target) {
        return fail("User not found", 404);
      }

      if (target.role === "owner") {
        return fail("The owner account cannot be deleted");
      }

      const { error } = await admin.auth.admin.deleteUser(userId);

      if (error) return fail(error.message);

      return respond({ success: true });
    }

    return fail("Unknown action");
  } catch (error) {
    console.error(
      "manage-users unexpected error:",
      error instanceof Error ? error.message : String(error)
    );

    return fail("An unexpected server error occurred", 500);
  }
});
