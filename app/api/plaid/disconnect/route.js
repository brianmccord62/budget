/**
 * app/api/plaid/disconnect/route.js
 * Removes a Plaid item and all its accounts + transactions from Supabase.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlaidClient } from "@/lib/plaidClient";

export async function POST(request) {
  try {
    const { itemId, userId, householdId } = await request.json();

    if (!itemId || !userId || !householdId) {
      return NextResponse.json(
        { error: "Missing itemId, userId, or householdId." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify membership
    const { data: member, error: memberError } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // Get the access token so we can remove the item from Plaid too
    const { data: item } = await supabase
      .from("plaid_items")
      .select("access_token")
      .eq("item_id", itemId)
      .eq("household_id", householdId)
      .maybeSingle();

    // Remove from Plaid (best effort — don't fail if this errors)
    if (item?.access_token) {
      try {
        const plaid = getPlaidClient();
        await plaid.itemRemove({ access_token: item.access_token });
      } catch (e) {
        console.warn("Plaid itemRemove failed (continuing):", e?.response?.data || e.message);
      }
    }

    // Delete transactions, accounts, then the item
    await supabase.from("transactions").delete().eq("item_id", itemId).eq("household_id", householdId);
    await supabase.from("accounts").delete().eq("item_id", itemId).eq("household_id", householdId);

    const { error } = await supabase
      .from("plaid_items")
      .delete()
      .eq("item_id", itemId)
      .eq("household_id", householdId);

    if (error) {
      return NextResponse.json({ error: "Could not remove item." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("disconnect error", error);
    return NextResponse.json({ error: "Could not disconnect bank." }, { status: 500 });
  }
}
