import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaidClient";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { publicToken, userId, householdId } = await request.json();

    if (!publicToken || !userId || !householdId) {
      return NextResponse.json({ error: "Missing publicToken, userId, or householdId." }, { status: 400 });
    }

    const plaidClient = getPlaidClient();
    const supabase = getSupabaseAdmin();

    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const item = await plaidClient.itemGet({ access_token: accessToken });
    const institutionId = item.data.item.institution_id || null;

    let institutionName = "Connected institution";
    if (institutionId) {
      try {
        const inst = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"],
        });
        institutionName = inst.data.institution.name || institutionName;
      } catch {
        // Institution name is nice to have, not required.
      }
    }

    const { error } = await supabase.from("plaid_items").upsert({
      user_id: userId,
      household_id: householdId,
      item_id: itemId,
      institution_id: institutionId,
      institution_name: institutionName,
      access_token: accessToken,
      sync_cursor: null,
    }, { onConflict: "item_id" });

    if (error) {
      console.error("Supabase plaid_items error", error);
      return NextResponse.json({ error: "Plaid connected, but database save failed." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item_id: itemId, institution_name: institutionName });
  } catch (error) {
    console.error("exchange-public-token error", error?.response?.data || error);
    return NextResponse.json({ error: "Could not exchange Plaid token." }, { status: 500 });
  }
}
