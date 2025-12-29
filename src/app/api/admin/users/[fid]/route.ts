import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";
import { verifyAdminAuth } from "~/lib/admin";

// PATCH /api/admin/users/[fid] - Update user (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - admin access required" },
      { status: 401 }
    );
  }

  const { fid } = await params;
  const userFid = parseInt(fid, 10);

  if (isNaN(userFid)) {
    return NextResponse.json({ error: "Invalid FID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const supabase = createServerClient();

    // Allowed fields to update
    const allowedFields = ["username", "display_name", "balance", "streak"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate balance if provided
    if (updateData.balance !== undefined && Number(updateData.balance) < 0) {
      return NextResponse.json(
        { error: "Balance cannot be negative" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("fid", userFid)
      .select()
      .single();

    if (error) {
      console.error("Admin update user error:", error);
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "updated",
      user: data,
    });
  } catch (error) {
    console.error("Admin user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users/[fid]/credit - Credit user balance (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - admin access required" },
      { status: 401 }
    );
  }

  const { fid } = await params;
  const userFid = parseInt(fid, 10);

  if (isNaN(userFid)) {
    return NextResponse.json({ error: "Invalid FID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be positive" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get current balance
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("balance")
      .eq("fid", userFid)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const newBalance = Number(user.balance) + amount;

    // Update balance
    const { error: updateError } = await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("fid", userFid);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to credit balance" },
        { status: 500 }
      );
    }

    // Log the admin action (in production, this should go to an audit log table)
    console.log(
      `[ADMIN] Credited fid:${userFid} with $${amount}. Reason: ${reason || "Not specified"}. New balance: $${newBalance}`
    );

    return NextResponse.json({
      status: "credited",
      fid: userFid,
      amount,
      new_balance: newBalance,
      reason: reason || null,
    });
  } catch (error) {
    console.error("Admin credit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
