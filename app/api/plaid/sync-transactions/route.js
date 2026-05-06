import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaidClient";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { categorizeTransaction } from "@/lib/financeRules";

async function getCustomRules(supabase, householdId) {
  const { data, error } = await supabase
    .from("category_rules")
    .select("pattern, category")
    .eq("household_id", householdId);

  if (error) {
    console.error("category rules error", error);
    return [];
  }

  return data || [];
}

export async function POST(request) {
  try {
    const { userId, householdId } = await request.json();

    if (!userId || !householdId) {
      return NextResponse.json({ error: "Missing userId or householdId." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const plaidClient = getPlaidClient();

    const { data: items, error: itemsError } = await supabase
      .from("plaid_items")
      .select("*")
      .eq("household_id", householdId);

    if (itemsError) {
      return NextResponse.json({ error: "Could not load Plaid items." }, { status: 500 });
    }

    const customRules = await getCustomRules(supabase, householdId);
    const results = [];

    for (const item of items || []) {
      let cursor = item.sync_cursor;
      let added = [];
      let modified = [];
      let removed = [];
      let hasMore = true;

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor: cursor || undefined,
          count: 500,
        });

        added = added.concat(response.data.added);
        modified = modified.concat(response.data.modified);
        removed = removed.concat(response.data.removed);
        cursor = response.data.next_cursor;
        hasMore = response.data.has_more;
      }

      const allTransactions = [...added, ...modified];

      const accountsResponse = await plaidClient.accountsGet({ access_token: item.access_token });
      const accountRows = accountsResponse.data.accounts.map((account) => ({
        plaid_account_id: account.account_id,
        household_id: householdId,
        item_id: item.item_id,
        name: account.name,
        official_name: account.official_name,
        type: account.type,
        subtype: account.subtype,
        mask: account.mask,
        current_balance: account.balances.current,
        available_balance: account.balances.available,
        iso_currency_code: account.balances.iso_currency_code,
      }));

      if (accountRows.length) {
        await supabase.from("accounts").upsert(accountRows, { onConflict: "plaid_account_id" });
      }

      const txRows = allTransactions.map((tx) => ({
        plaid_transaction_id: tx.transaction_id,
        plaid_account_id: tx.account_id,
        household_id: householdId,
        item_id: item.item_id,
        name: tx.name,
        merchant_name: tx.merchant_name,
        amount: tx.amount,
        iso_currency_code: tx.iso_currency_code,
        date: tx.date,
        pending: tx.pending,
        payment_channel: tx.payment_channel,
        plaid_category: tx.category,
        plaid_personal_finance_category: tx.personal_finance_category,
        category: categorizeTransaction(tx, customRules),
        raw: tx,
      }));

      if (txRows.length) {
        await supabase.from("transactions").upsert(txRows, { onConflict: "plaid_transaction_id" });
      }

      if (removed.length) {
        const removedIds = removed.map((tx) => tx.transaction_id);
        await supabase.from("transactions").delete().in("plaid_transaction_id", removedIds);
      }

      await supabase
        .from("plaid_items")
        .update({ sync_cursor: cursor, updated_at: new Date().toISOString() })
        .eq("id", item.id);

      results.push({
        institution_name: item.institution_name,
        added: added.length,
        modified: modified.length,
        removed: removed.length,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("sync-transactions error", error?.response?.data || error);
    return NextResponse.json({ error: "Could not sync transactions." }, { status: 500 });
  }
}
