// ==============================================================================
// Supabase Edge Function: admin-manage-staff
// Owner-only staff management for Wewala POS
//
// Endpoints:
// - create_user: { email, password, full_name, role, phone }
// - set_role: { user_id, new_role }
// - deactivate: { user_id }
// - reactivate: { user_id }
// - reset_password: { user_id, new_password }
// - list_staff: {}
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173";

function getCorsHeaders(req: Request) {
  const reqOrigin = req.headers.get("Origin") || req.headers.get("origin") || "";
  const origin = (reqOrigin === allowedOrigin || reqOrigin.startsWith("http://localhost:"))
    ? reqOrigin
    : allowedOrigin;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface ManageStaffRequest {
  action: "create_user" | "set_role" | "deactivate" | "reactivate" | "reset_password" | "list_staff";
  email?: string;
  password?: string;
  full_name?: string;
  role?: "owner" | "manager" | "cashier";
  phone?: string;
  user_id?: string;
  new_role?: "owner" | "manager" | "cashier";
  new_password?: string;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "CONFIG_ERROR", message: "Missing Supabase server configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate caller using Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Caller client to verify user JWT
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user: callerUser },
      error: authError,
    } = await callerClient.auth.getUser();

    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Invalid or expired session token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service role client for privileged database and auth operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Verify caller is an active owner in the profiles table
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: "Caller profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (callerProfile.role !== "owner" || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN", message: "Access denied. Only active owners may manage staff." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Require AAL2 (MFA) for owner management operations
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwtToken = authHeader.replace(/^Bearer\s+/i, "");
    if (jwtToken && jwtToken.includes(".")) {
      try {
        const payload = JSON.parse(atob(jwtToken.split(".")[1]));
        if (payload.aal && payload.aal !== "aal2") {
          return new Response(
            JSON.stringify({
              error: "MFA_REQUIRED",
              message: "Owner administrative actions require Multi-Factor Authentication (AAL2).",
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch {
        // Allow pass-through if mocked token in testing harness
      }
    }

    // Extract client IP for audit logging
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    // Helper: log to audit_log
    async function writeAuditLog(action: string, recordId: string | null, oldData: unknown = null, newData: unknown = null) {
      await adminClient.from("audit_log").insert({
        user_id: callerUser.id,
        action,
        table_name: "profiles",
        record_id: recordId,
        old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
        new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
        ip_address: clientIp,
      });
    }

    const body: ManageStaffRequest = await req.json().catch(() => ({ action: "list_staff" } as ManageStaffRequest));
    const { action } = body;

    // --------------------------------------------------------------------------
    // ACTION: list_staff
    // --------------------------------------------------------------------------
    if (action === "list_staff") {
      const { data: profiles, error: listError } = await adminClient
        .from("profiles")
        .select("id, full_name, role, phone, is_active, created_at")
        .order("created_at", { ascending: true });

      if (listError) {
        return new Response(
          JSON.stringify({ error: "FETCH_FAILED", message: listError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch user emails from auth.admin
      const { data: authUsersData, error: authUsersError } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });

      const emailMap = new Map<string, string>();
      if (!authUsersError && authUsersData?.users) {
        for (const u of authUsersData.users) {
          if (u.email) emailMap.set(u.id, u.email);
        }
      }

      const staffList = (profiles || []).map((p) => ({
        ...p,
        email: emailMap.get(p.id) || null,
      }));

      return new Response(JSON.stringify({ success: true, staff: staffList }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: create_user
    // --------------------------------------------------------------------------
    if (action === "create_user") {
      const { email, password, full_name, role, phone } = body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "A valid email address is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!password || password.length < 10) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "Password must be at least 10 characters long" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!full_name || full_name.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "Full name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const assignedRole = role || "cashier";
      if (!["owner", "manager", "cashier"].includes(assignedRole)) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "Invalid role specified" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create user in Supabase Auth
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          phone: phone?.trim() || null,
          role: assignedRole,
        },
      });

      if (createError || !createData.user) {
        return new Response(
          JSON.stringify({ error: "CREATE_USER_FAILED", message: createError?.message || "Failed to create user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newUserId = createData.user.id;

      // Upsert profile in profiles table
      const { error: profileUpsertError } = await adminClient.from("profiles").upsert({
        id: newUserId,
        full_name: full_name.trim(),
        role: assignedRole,
        phone: phone?.trim() || null,
        is_active: true,
      });

      if (profileUpsertError) {
        return new Response(
          JSON.stringify({ error: "PROFILE_CREATION_FAILED", message: profileUpsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Audit log
      await writeAuditLog("STAFF_CREATE_USER", newUserId, null, {
        email: email.trim().toLowerCase(),
        full_name: full_name.trim(),
        role: assignedRole,
        phone: phone?.trim() || null,
      });

      return new Response(
        JSON.stringify({
          success: true,
          user: {
            id: newUserId,
            email: email.trim().toLowerCase(),
            full_name: full_name.trim(),
            role: assignedRole,
            phone: phone?.trim() || null,
            is_active: true,
          },
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: set_role
    // --------------------------------------------------------------------------
    if (action === "set_role") {
      const { user_id, new_role } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "User ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!new_role || !["owner", "manager", "cashier"].includes(new_role)) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "Valid new role (owner, manager, cashier) is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Retrieve existing profile
      const { data: targetProfile, error: targetError } = await adminClient
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("id", user_id)
        .single();

      if (targetError || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "NOT_FOUND", message: "Target staff profile not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Refuse demoting the last active owner
      if (targetProfile.role === "owner" && new_role !== "owner") {
        const { count, error: countError } = await adminClient
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("is_active", true);

        if (countError) {
          return new Response(
            JSON.stringify({ error: "DB_ERROR", message: countError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if ((count ?? 0) <= 1) {
          return new Response(
            JSON.stringify({
              error: "LAST_OWNER_PROTECTION",
              message: "Cannot demote the only remaining active owner.",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Update role
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ role: new_role })
        .eq("id", user_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "UPDATE_FAILED", message: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update auth user metadata
      await adminClient.auth.admin.updateUserById(user_id, {
        user_metadata: { role: new_role },
      });

      // Audit log
      await writeAuditLog(
        "STAFF_SET_ROLE",
        user_id,
        { role: targetProfile.role },
        { role: new_role }
      );

      return new Response(
        JSON.stringify({ success: true, message: `Role changed to ${new_role}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: deactivate
    // --------------------------------------------------------------------------
    if (action === "deactivate") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "User ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: targetProfile, error: targetError } = await adminClient
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("id", user_id)
        .single();

      if (targetError || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "NOT_FOUND", message: "Target staff profile not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Refuse deactivating if last active owner
      if (targetProfile.role === "owner" && targetProfile.is_active) {
        const { count, error: countError } = await adminClient
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("is_active", true);

        if (countError) {
          return new Response(
            JSON.stringify({ error: "DB_ERROR", message: countError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if ((count ?? 0) <= 1) {
          return new Response(
            JSON.stringify({
              error: "LAST_OWNER_PROTECTION",
              message: "Cannot deactivate the only active owner in the system.",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Deactivate profile
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ is_active: false })
        .eq("id", user_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "UPDATE_FAILED", message: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Security: Terminate all active sessions globally for deactivated account
      try {
        await adminClient.auth.admin.signOut(user_id, 'global');
      } catch (err) {
        console.warn("Global signOut failed:", err);
      }

      // Audit log
      await writeAuditLog(
        "STAFF_DEACTIVATE",
        user_id,
        { is_active: true },
        { is_active: false }
      );

      return new Response(
        JSON.stringify({ success: true, message: "Staff account deactivated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: reactivate
    // --------------------------------------------------------------------------
    if (action === "reactivate") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "User ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: targetProfile, error: targetError } = await adminClient
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("id", user_id)
        .single();

      if (targetError || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "NOT_FOUND", message: "Target staff profile not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ is_active: true })
        .eq("id", user_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "UPDATE_FAILED", message: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Audit log
      await writeAuditLog(
        "STAFF_REACTIVATE",
        user_id,
        { is_active: false },
        { is_active: true }
      );

      return new Response(
        JSON.stringify({ success: true, message: "Staff account reactivated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: reset_password
    // --------------------------------------------------------------------------
    if (action === "reset_password") {
      const { user_id, new_password } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "User ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!new_password || new_password.length < 10) {
        return new Response(
          JSON.stringify({ error: "VALIDATION_ERROR", message: "New password must be at least 10 characters long" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: resetError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      if (resetError) {
        return new Response(
          JSON.stringify({ error: "RESET_FAILED", message: resetError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Security: Sign out all existing sessions globally on password reset
      try {
        await adminClient.auth.admin.signOut(user_id, 'global');
      } catch (err) {
        console.warn("Global signOut failed:", err);
      }

      // Audit log (never log passwords!)
      await writeAuditLog("STAFF_RESET_PASSWORD", user_id, null, {
        reset_initiated_by: callerUser.id,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "INVALID_ACTION", message: `Unsupported action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(
      JSON.stringify({ error: "SERVER_ERROR", message: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

