import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaidClient";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { publicToken, metadata, userId, householdId } = await request.json();

    if (!publicToken || !userId || !householdId) {
      return NextResponse.json(
        { error: "Missing publicToken, userId, or householdId." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify household membership
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

    // Exchange public token for access token
    const plaid = getPlaidClient();
    const exchangeResponse = await plaid.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    const institutionName = metadata?.institution?.name || "Unknown Bank";

    // Save to plaid_items table
    const { error } = await supabase.from("plaid_items").upsert(
      {
        user_id: userId,
        household_id: householdId,
        item_id: itemId,
        access_token: accessToken,
        institution_name: institutionName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );

    if (error) {
      console.error("plaid_items upsert error", error);
      return NextResponse.json(
        { error: "Connected but database save failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item_id: itemId,
      institution_name: institutionName,
    });
  } catch (error) {
    console.error("exchange-public-token error", error?.response?.data || error);
    return NextResponse.json(
      { error: "Could not exchange Plaid token." },
      { status: 500 }
    );
  }
}
