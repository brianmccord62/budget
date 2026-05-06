/**
 * app/api/teller/disconnect/route.js
 *
 * Removes a Teller enrollment and all associated accounts + transactions
 * for that enrollment from Supabase.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { enrollmentId, userId, householdId } = await request.json();

    if (!enrollmentId || !userId || !householdId) {
      return NextResponse.json(
        { error: "Missing enrollmentId, userId, or householdId." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify the user belongs to this household
    const { data: member, error: memberError } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "You do not have access to this household." },
        { status: 403 }
      );
    }

    // Delete transactions for this enrollment
    await supabase
      .from("transactions")
      .delete()
      .eq("enrollment_id", enrollmentId)
      .eq("household_id", householdId);

    // Delete accounts for this enrollment
    await supabase
      .from("accounts")
      .delete()
      .eq("enrollment_id", enrollmentId)
      .eq("household_id", householdId);

    // Delete the enrollment itself
    const { error } = await supabase
      .from("teller_enrollments")
      .delete()
      .eq("enrollment_id", enrollmentId)
      .eq("household_id", householdId);

    if (error) {
      console.error("disconnect error", error);
      return NextResponse.json(
        { error: "Could not remove enrollment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("disconnect error", error);
    return NextResponse.json(
      { error: "Could not disconnect bank." },
      { status: 500 }
    );
  }
}
