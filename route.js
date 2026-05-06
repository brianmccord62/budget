/**
 * app/api/teller/save-enrollment/route.js
 *
 * Called by TellerConnect.jsx after the user successfully links a bank.
 * Verifies the access token works, then saves the enrollment to Supabase.
 *
 * Replaces: app/api/plaid/exchange-public-token/route.js
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccounts } from "@/lib/tellerClient";

export async function POST(request) {
  try {
    const { accessToken, enrollment, userId, householdId } = await request.json();

    if (!accessToken || !enrollment || !userId || !householdId) {
      return NextResponse.json(
        { error: "Missing accessToken, enrollment, userId, or householdId." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Confirm the signed-in user belongs to this household
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

    // Verify the access token actually works before saving
    const accounts = await getAccounts(accessToken);

    // Save the enrollment — upsert on enrollment_id so reconnecting the same
    // bank updates the token rather than creating a duplicate row
    const { error } = await supabase.from("teller_enrollments").upsert(
      {
        user_id: userId,
        household_id: householdId,
        enrollment_id: enrollment.id,
        institution_name: enrollment.institution.name,
        access_token: accessToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id" }
    );

    if (error) {
      console.error("teller_enrollments upsert error", error);
      return NextResponse.json(
        { error: "Bank connected but database save failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      enrollment_id: enrollment.id,
      institution_name: enrollment.institution.name,
      accounts_found: accounts.length,
    });
  } catch (error) {
    console.error("save-enrollment error", error?.message || error);
    return NextResponse.json(
      { error: "Could not save Teller enrollment." },
      { status: 500 }
    );
  }
}
