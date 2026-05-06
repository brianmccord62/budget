import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildAdvisorSystemPrompt,
  buildAdvisorUserPrompt,
  buildFinanceSnapshot,
} from "@/lib/advisorPrompt";

export async function POST(request) {
  try {
    const { userId, householdId, question } = await request.json();

    if (!userId || !householdId || !question) {
      return NextResponse.json({ error: "Missing userId, householdId, or question." }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Missing ANTHROPIC_API_KEY. Add it to .env.local and Vercel environment variables." },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Confirm the signed-in user belongs to this household.
    // The service role bypasses RLS, so we do this check manually.
    const { data: member, error: memberError } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json({ error: "You do not have access to this household." }, { status: 403 });
    }

    const [
      { data: household },
      { data: accounts },
      { data: transactions },
      { data: budgetCategories },
      { data: savingsGoals },
    ] = await Promise.all([
      supabase.from("households").select("*").eq("id", householdId).single(),
      supabase.from("accounts").select("*").eq("household_id", householdId).order("name"),
      supabase
        .from("transactions")
        .select("*")
        .eq("household_id", householdId)
        .order("date", { ascending: false })
        .limit(500),
      supabase.from("budget_categories").select("*").eq("household_id", householdId),
      supabase.from("savings_goals").select("*").eq("household_id", householdId),
    ]);

    const snapshot = buildFinanceSnapshot({
      household,
      accounts: accounts || [],
      transactions: transactions || [],
      budgetCategories: budgetCategories || [],
      savingsGoals: savingsGoals || [],
    });

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
      max_tokens: 900,
      temperature: 0.2,
      system: buildAdvisorSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildAdvisorUserPrompt({ question, snapshot }),
        },
      ],
    });

    const answer =
      response.content
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .trim() || "I could not generate an answer.";

    return NextResponse.json({ answer, snapshot });
  } catch (error) {
    console.error("advisor ask error", error);
    return NextResponse.json({ error: "Could not ask Claude for financial guidance." }, { status: 500 });
  }
}
