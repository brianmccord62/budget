/**
 * app/api/teller/sync-transactions/route.js
 *
 * Syncs transactions for all enrolled accounts in a household.
 * Teller returns newest-first; we upsert on teller_transaction_id so re-runs are safe.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccounts, getTransactions } from "@/lib/tellerClient";
import { categorizeTransaction } from "@/lib/financeRules";

async function getCustomRules(supabase, householdId) {
  const { data, error } = await supabase
    .from("category_rules")
    .select("pattern, category")
    .eq("household_id", householdId);
  if (error) console.error("category_rules fetch error", error);
  return data || [];
}

export async function POST(request) {
  try {
    const { userId, householdId } = await request.json();

    if (!userId || !householdId) {
      return NextResponse.json(
        { error: "Missing userId or householdId." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: enrollments, error: enrollmentsError } = await supabase
      .from("teller_enrollments")
      .select("*")
      .eq("household_id", householdId);

    if (enrollmentsError) {
      return NextResponse.json(
        { error: "Could not load enrollments." },
        { status: 500 }
      );
    }

    const customRules = await getCustomRules(supabase, householdId);
    const results = [];

    for (const enrollment of enrollments || []) {
      try {
        const accounts = await getAccounts(enrollment.access_token);

        // Upsert accounts with latest metadata
        const accountRows = accounts.map((acct) => ({
          teller_account_id: acct.id,
          household_id: householdId,
          enrollment_id: enrollment.enrollment_id,
          institution_name: acct.institution?.name || enrollment.institution_name,
          name: acct.name,
          type: acct.type,
          subtype: acct.subtype,
          last_four: acct.last_four,
          currency: acct.currency,
          status: acct.status,
        }));

        if (accountRows.length) {
          await supabase
            .from("accounts")
            .upsert(accountRows, { onConflict: "teller_account_id" });
        }

        let totalAdded = 0;

        for (const account of accounts) {
          const transactions = await getTransactions(
            enrollment.access_token,
            account.id
          );

          if (!transactions.length) continue;

          const txRows = transactions.map((tx) => ({
            teller_transaction_id: tx.id,
            teller_account_id: tx.account_id,
            household_id: householdId,
            enrollment_id: enrollment.enrollment_id,
            description: tx.description,
            merchant_name: tx.details?.counterparty?.name || null,
            // Normalize: positive = expense (matches Plaid convention)
            amount:
              tx.type === "debit"
                ? Math.abs(parseFloat(tx.amount))
                : -Math.abs(parseFloat(tx.amount)),
            currency: "USD",
            date: tx.date,
            status: tx.status,
            type: tx.type,
            teller_category: tx.details?.category || null,
            category: categorizeTransaction(
              {
                name: tx.description,
                merchant_name: tx.details?.counterparty?.name,
              },
              customRules
            ),
            raw: tx,
          }));

          if (txRows.length) {
            await supabase
              .from("transactions")
              .upsert(txRows, { onConflict: "teller_transaction_id" });
            totalAdded += txRows.length;
          }
        }

        await supabase
          .from("teller_enrollments")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", enrollment.id);

        results.push({
          institution_name: enrollment.institution_name,
          accounts: accounts.length,
          transactions_synced: totalAdded,
        });
      } catch (err) {
        console.error(`Sync failed for enrollment ${enrollment.enrollment_id}:`, err);
        results.push({
          institution_name: enrollment.institution_name,
          error: err.message,
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("sync-transactions error", error);
    return NextResponse.json(
      { error: "Could not sync transactions." },
      { status: 500 }
    );
  }
}
