import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaidClient";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { categorizeTransaction } from "@/lib/financeRules";

export async function POST(request) {
  try {
    const { userId, householdId } = await request.json();
    if (!userId || !householdId) {
      return NextResponse.json({ error: "Missing userId or householdId." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const plaid = getPlaidClient();

    const { data: items } = await supabase
      .from("plaid_items")
      .select("*")
      .eq("household_id", householdId);

    const { data: customRules } = await supabase
      .from("category_rules")
      .select("pattern, category")
      .eq("household_id", householdId);

    const results = [];

    for (const item of items || []) {
      try {
        const accountsResponse = await plaid.accountsGet({ access_token: item.access_token });

        const accountRows = accountsResponse.data.accounts.map((acct) => ({
          plaid_account_id: acct.account_id,
          household_id: householdId,
          item_id: item.item_id,
          institution_name: item.institution_name,
          name: acct.name,
          type: acct.type,
          subtype: acct.subtype,
          mask: acct.mask,
          current_balance: acct.balances.current,
          available_balance: acct.balances.available,
        }));

        if (accountRows.length) {
          await supabase.from("accounts").upsert(accountRows, { onConflict: "plaid_account_id" });
        }

        let cursor = item.transactions_cursor || null;
        let added = [];
        let hasMore = true;

        while (hasMore) {
          const syncResponse = await plaid.transactionsSync({
            access_token: item.access_token,
            cursor: cursor || undefined,
          });
          added = added.concat(syncResponse.data.added);
          hasMore = syncResponse.data.has_more;
          cursor = syncResponse.data.next_cursor;
        }

        const txRows = added.map((tx) => ({
          plaid_transaction_id: tx.transaction_id,
          plaid_account_id: tx.account_id,
          household_id: householdId,
          item_id: item.item_id,
          name: tx.name,
          merchant_name: tx.merchant_name,
          amount: tx.amount,
          currency: tx.iso_currency_code || "USD",
          date: tx.date,
          pending: tx.pending,
          plaid_category: tx.personal_finance_category?.primary || null,
          category: categorizeTransaction(
            { name: tx.name, merchant_name: tx.merchant_name },
            customRules || []
          ),
        }));

        if (txRows.length) {
          await supabase.from("transactions").upsert(txRows, { onConflict: "plaid_transaction_id" });
        }

        await supabase.from("plaid_items").update({
          transactions_cursor: cursor,
          updated_at: new Date().toISOString(),
        }).eq("item_id", item.item_id);

        results.push({ institution_name: item.institution_name, accounts: accountRows.length, transactions_synced: txRows.length });
      } catch (err) {
        console.error(`Sync failed for ${item.item_id}:`, err?.response?.data || err);
        results.push({ institution_name: item.institution_name, error: err.message });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("sync-transactions error", error);
    return NextResponse.json({ error: "Could not sync transactions." }, { status: 500 });
  }
}
