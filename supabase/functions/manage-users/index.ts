
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const fail = (message: string, status = 400) =>
  response({ error: message }, status);

const usernameIsValid = (username: string) =>
  /^[a-z0-9_]{3,24}$/.test(username);

Deno.serve(async (req) => {
  // Browser CORS preflight must succeed before any authentication.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      console.error("Missing required Supabase function secrets");
      return fail("Server configuration is incomplete", 500);
    }

    const body = await req.json();
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

      if (!usernameIsValid(username) || !password) {
        return fail("Invalid username or password", 401);
      }

      const { data: profile, error: profileError } = await admin
        .from("user_profiles")
        .select("user_id")
        .eq("username", username)
        .maybeSingle();

      if (profileError || !profile) {
        console.error("Username lookup failed:", profileError);
        return fail("Invalid username or password", 401);
      }

      const { data: authUser, error: authUserError } =
        await admin.auth.admin.getUserById(profile.user_id);

      const email = authUser?.user?.email;

      if (authUserError || !email) {
        console.error("Auth user lookup failed:", authUserError);
        return fail("Invalid username or password", 401);
      }

      const loginClient = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data: loginData, error: loginError } =
        await loginClient.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError || !loginData.session) {
        console.error("Login failed:", loginError?.message);
        return fail("Invalid username or password", 401);
      }

      return response({
        success: true,
        session: loginData.session,
      });
    }

    // ALL OTHER ACTIONS REQUIRE AN AUTHENTICATED OWNER
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return fail("Not authorised", 401);
    }

    const userClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const { data: authData, error: authError } =
      await userClient.auth.getUser();

    if (authError || !authData.user) {
      return fail("Not authorised", 401);
    }

    const { data: ownerProfile, error: ownerError } = await admin
      .from("user_profiles")
      .select("role")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (ownerError || ownerProfile?.role !== "owner") {
      return fail("Only the owner can perform this action", 403);
    }

    // CREATE A USER
    if (action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!usernameIsValid(username)) {
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

      const { error: profileInsertError } = await admin
        .from("user_profiles")
        .insert({
          user_id: created.user.id,
          username,
          role: "user",
        });

      if (profileInsertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return fail(profileInsertError.message);
      }

      return response({
        success: true,
        userId: created.user.id,
      });
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
        return fail(profilesResult.error.message, 500);
      }

      if (categoriesResult.error) {
        return fail(categoriesResult.error.message, 500);
      }

      if (permissionsResult.error) {
        return fail(permissionsResult.error.message, 500);
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

      return response({
        success: true,
        users,
        categories: categoriesResult.data || [],
      });
    }

    // REPLACE A USER'S CATEGORY PERMISSIONS
    if (action === "updatePermissions") {
      const userId = String(body.userId || "");
      const permissions = Array.isArray(body.permissions)
        ? body.permissions
        : [];

      if (!userId) {
        return fail("Missing user ID");
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
        return fail("Owner permissions cannot be changed");
      }

      const { data: categories, error: categoriesError } = await admin
        .from("map_categories")
        .select("id");

      if (categoriesError) {
        return fail(categoriesError.message, 500);
      }

      const validIds = new Set((categories || []).map((c) => c.id));
      const rows = [];

      for (const item of permissions) {
        if (!validIds.has(item.categoryId)) {
          return fail("One of the selected categories is invalid");
        }

        const canView = item.canView === true;
        const canAdd = item.canAdd === true;
        const canEdit = item.canEdit === true;
        const canDelete = item.canDelete === true;

        if ((canAdd || canEdit || canDelete) && !canView) {
          return fail(
            "Add, edit and delete permissions require view permission"
          );
        }

        if (canView) {
          rows.push({
            user_id: userId,
            category_id: item.categoryId,
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
        return fail(deleteError.message, 500);
      }

      if (rows.length) {
        const { error: insertError } = await admin
          .from("user_category_permissions")
          .insert(rows);

        if (insertError) {
          return fail(insertError.message, 500);
        }
      }

      return response({ success: true });
    }

    // CHANGE A USER'S PASSWORD
    if (action === "updatePassword") {
      const userId = String(body.userId || "");
      const password = String(body.password || "");

      if (password.length < 10) {
        return fail("Password must be at least 10 characters");
      }

      const { data: target } = await admin
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!target) {
        return fail("User not found", 404);
      }

      if (target.role === "owner") {
        return fail("The owner password cannot be changed here");
      }

      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
      });

      if (error) {
        return fail(error.message);
      }

      return response({ success: true });
    }

    // DELETE A USER
    if (action === "delete") {
      const userId = String(body.userId || "");

      if (!userId || userId === authData.user.id) {
        return fail("You cannot delete your own owner account");
      }

      const { data: target } = await admin
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!target) {
        return fail("User not found", 404);
      }

      if (target.role === "owner") {
        return fail("The owner account cannot be deleted");
      }

      const { error } = await admin.auth.admin.deleteUser(userId);

      if (error) {
        return fail(error.message);
      }

      return response({ success: true });
    }

    return fail("Unknown action");
  } catch (error) {
    console.error("manage-users error:", error);
    return fail("An unexpected server error occurred", 500);
  }
});
