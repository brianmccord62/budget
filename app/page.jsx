"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Link as LinkIcon,
  LogOut,
  PiggyBank,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Target,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { buildAdvisorNotes } from "@/lib/financeRules";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const defaultBudgetCategories = [
  "Housing",
  "Utilities",
  "Groceries",
  "Eating out / coffee",
  "Gas",
  "Insurance",
  "Giving",
  "Subscriptions",
  "Shopping",
  "Fun",
  "Travel",
  "Uncategorized",
];

function Card({ children, className = "" }) {
  return <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const styles =
    variant === "ghost"
      ? "bg-transparent text-slate-600 hover:bg-slate-100"
      : variant === "secondary"
      ? "bg-slate-100 text-slate-950 hover:bg-slate-200"
      : "bg-slate-950 text-white hover:bg-slate-800";

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input {...props} className={`w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-slate-950/10 ${props.className || ""}`} />;
}

function SelectInput(props) {
  return <select {...props} className={`w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-slate-950/10 ${props.className || ""}`} />;
}

function StatCard({ icon: Icon, title, value, note }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function Tabs({ activeTab, setActiveTab }) {
  const tabs = [
    ["advisor", "Advisor"],
    ["transactions", "Transactions"],
    ["budget", "Budget"],
    ["rules", "Rules"],
    ["household", "Household"],
  ];

  return (
    <div className="grid gap-1 rounded-3xl bg-white p-1 shadow-sm ring-1 ring-slate-200 md:grid-cols-5">
      {tabs.map(([value, label]) => (
        <button
          key={value}
          onClick={() => setActiveTab(value)}
          className={`rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
            activeTab === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function ConnectedFinancialAdvisor() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [activeTab, setActiveTab] = useState("advisor");
  const [user, setUser] = useState(null);
  const [household, setHousehold] = useState(null);
  const [linkToken, setLinkToken] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [rules, setRules] = useState([]);
  const [budgetMonth, setBudgetMonth] = useState(null);
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [newRule, setNewRule] = useState({ pattern: "", category: "" });
  const [newBudget, setNewBudget] = useState({ category: "Groceries", amount: "" });
  const [newGoal, setNewGoal] = useState({ name: "", target: "", current: "", monthly: "", priority: "Medium" });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const currentMonthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }, []);

  async function ensureHousehold(currentUser) {
    const { data: memberships } = await supabase
      .from("household_members")
      .select("household_id, households(id, name)")
      .eq("user_id", currentUser.id)
      .limit(1);

    if (memberships?.length) {
      return memberships[0].households;
    }

    const { data: createdHousehold, error: hError } = await supabase
      .from("households")
      .insert({ name: "My Household", created_by: currentUser.id })
      .select()
      .single();

    if (hError) throw hError;

    const { error: mError } = await supabase.from("household_members").insert({
      household_id: createdHousehold.id,
      user_id: currentUser.id,
      role: "owner",
    });

    if (mError) throw mError;
    return createdHousehold;
  }

  const loadData = useCallback(async (currentHousehold) => {
    if (!currentHousehold) return;

    const [{ data: accountRows }, { data: transactionRows }, { data: ruleRows }, { data: goalRows }] = await Promise.all([
      supabase.from("accounts").select("*").eq("household_id", currentHousehold.id).order("name"),
      supabase.from("transactions").select("*").eq("household_id", currentHousehold.id).order("date", { ascending: false }).limit(500),
      supabase.from("category_rules").select("*").eq("household_id", currentHousehold.id).order("created_at", { ascending: false }),
      supabase.from("savings_goals").select("*").eq("household_id", currentHousehold.id).order("created_at", { ascending: true }),
    ]);

    setAccounts(accountRows || []);
    setTransactions(transactionRows || []);
    setRules(ruleRows || []);
    setSavingsGoals(goalRows || []);

    let { data: month } = await supabase
      .from("budget_months")
      .select("*")
      .eq("household_id", currentHousehold.id)
      .eq("month", currentMonthStart)
      .maybeSingle();

    if (!month) {
      const { data: created } = await supabase
        .from("budget_months")
        .insert({ household_id: currentHousehold.id, month: currentMonthStart, planned_income: 0, planned_savings: 0 })
        .select()
        .single();
      month = created;
    }

    setBudgetMonth(month);

    if (month) {
      const { data: budgetRows } = await supabase
        .from("budget_categories")
        .select("*")
        .eq("budget_month_id", month.id)
        .order("category");

      setBudgetCategories(budgetRows || []);
    }
  }, [supabase, currentMonthStart]);

  useEffect(() => {
    async function boot() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/auth";
        return;
      }

      setUser(data.user);
      const currentHousehold = await ensureHousehold(data.user);
      setHousehold(currentHousehold);
      await loadData(currentHousehold);
    }

    boot();
  }, [supabase, loadData]);

  async function createLinkToken() {
    if (!user) return;
    setIsBusy(true);
    setMessage("");

    const response = await fetch("/api/plaid/create-link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });

    const data = await response.json();
    setIsBusy(false);

    if (!response.ok) {
      setMessage(data.error || "Could not start Plaid.");
      return;
    }

    setLinkToken(data.link_token);
  }

  const onSuccess = useCallback(async (public_token) => {
    if (!user || !household) return;
    setIsBusy(true);
    setMessage("Connecting bank...");

    const response = await fetch("/api/plaid/exchange-public-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicToken: public_token, userId: user.id, householdId: household.id }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Bank connection failed.");
      setIsBusy(false);
      return;
    }

    setMessage(`Connected ${data.institution_name}. Now syncing transactions...`);
    await syncTransactions();
    setIsBusy(false);
  }, [user, household]);

  const plaid = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  useEffect(() => {
    if (linkToken && plaid.ready) {
      plaid.open();
    }
  }, [linkToken, plaid.ready]);

  async function syncTransactions() {
    if (!user || !household) return;
    setIsBusy(true);
    setMessage("Syncing transactions...");

    const response = await fetch("/api/plaid/sync-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, householdId: household.id }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Could not sync transactions.");
      setIsBusy(false);
      return;
    }

    setMessage("Transactions synced.");
    await loadData(household);
    setIsBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  async function addRule() {
    if (!newRule.pattern || !newRule.category || !household) return;
    await supabase.from("category_rules").insert({
      household_id: household.id,
      pattern: newRule.pattern,
      category: newRule.category,
    });
    setNewRule({ pattern: "", category: "" });
    await loadData(household);
  }

  async function deleteRule(id) {
    await supabase.from("category_rules").delete().eq("id", id);
    await loadData(household);
  }

  async function addBudgetCategory() {
    if (!budgetMonth || !household || !newBudget.amount) return;
    await supabase.from("budget_categories").upsert({
      household_id: household.id,
      budget_month_id: budgetMonth.id,
      category: newBudget.category,
      planned_amount: Number(newBudget.amount),
    }, { onConflict: "budget_month_id,category" });
    setNewBudget({ category: "Groceries", amount: "" });
    await loadData(household);
  }

  async function deleteBudgetCategory(id) {
    await supabase.from("budget_categories").delete().eq("id", id);
    await loadData(household);
  }

  async function addSavingsGoal() {
    if (!household || !newGoal.name || !newGoal.target) return;
    await supabase.from("savings_goals").insert({
      household_id: household.id,
      name: newGoal.name,
      target: Number(newGoal.target),
      current: Number(newGoal.current || 0),
      monthly: Number(newGoal.monthly || 0),
      priority: newGoal.priority,
    });
    setNewGoal({ name: "", target: "", current: "", monthly: "", priority: "Medium" });
    await loadData(household);
  }

  async function deleteSavingsGoal(id) {
    await supabase.from("savings_goals").delete().eq("id", id);
    await loadData(household);
  }

  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentTransactions = transactions.filter((tx) => tx.date?.startsWith(currentMonth));
    const spendingTransactions = currentTransactions.filter((tx) => Number(tx.amount) > 0);
    const incomeTransactions = currentTransactions.filter((tx) => Number(tx.amount) < 0);

    const monthlySpending = spendingTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const monthlyIncome = incomeTransactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0);
    const savingsGoalTotal = savingsGoals.reduce((sum, goal) => sum + Number(goal.monthly || 0), 0);

    const categoryTotals = {};
    for (const tx of spendingTransactions) {
      const key = tx.category || "Uncategorized";
      categoryTotals[key] = (categoryTotals[key] || 0) + Number(tx.amount);
    }

    const categoryData = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));
    const budgetTotal = budgetCategories.reduce((sum, row) => sum + Number(row.planned_amount || 0), 0);
    const accountBalanceTotal = accounts.reduce((sum, account) => sum + Number(account.current_balance || 0), 0);

    return {
      currentTransactions,
      spendingTransactions,
      monthlySpending,
      monthlyIncome,
      savingsGoalTotal,
      categoryTotals,
      categoryData,
      budgetTotal,
      accountBalanceTotal,
      margin: monthlyIncome - monthlySpending - savingsGoalTotal,
    };
  }, [transactions, savingsGoals, budgetCategories, accounts]);

  const advisorNotes = useMemo(() => buildAdvisorNotes(analytics), [analytics]);

  async function askAdvisor() {
    const q = question.trim();
    if (!q || !user || !household) return;

    setIsBusy(true);
    setAnswer("Thinking through your financial snapshot...");

    try {
      const response = await fetch("/api/advisor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          householdId: household.id,
          question: q,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAnswer(data.error || "Claude could not answer right now.");
        setIsBusy(false);
        return;
      }

      setAnswer(data.answer);
    } catch {
      setAnswer("The advisor route failed. Check your ANTHROPIC_API_KEY and server logs.");
    } finally {
      setIsBusy(false);
    }
  }

  if (!user || !household) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="p-6">
          <p className="font-bold">Loading your financial advisor...</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] bg-slate-950 p-6 text-white md:p-8"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-300">
                <ShieldCheck className="h-4 w-4" />
                Connected financial advisor
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
                Your money, connected and categorized.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Connect banks with Plaid, sync transactions, customize categories, plan monthly budgets, share one household, and ask basic planning questions.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={createLinkToken} disabled={isBusy} className="bg-white text-slate-950 hover:bg-slate-100">
                <LinkIcon className="h-4 w-4" />
                Connect bank
              </Button>
              <Button onClick={syncTransactions} disabled={isBusy} className="bg-white/10 text-white hover:bg-white/20">
                <RefreshCcw className="h-4 w-4" />
                Sync
              </Button>
              <Button onClick={signOut} variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </motion.section>

        {message && <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">{message}</div>}

        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard icon={Banknote} title="Tracked income" value={money.format(analytics.monthlyIncome)} note="This month from transactions" />
          <StatCard icon={CreditCard} title="Tracked spending" value={money.format(analytics.monthlySpending)} note="This month from transactions" />
          <StatCard icon={PiggyBank} title="Planned savings" value={money.format(analytics.savingsGoalTotal)} note="Savings goals per month" />
          <StatCard icon={Wallet} title="Connected balance" value={money.format(analytics.accountBalanceTotal)} note={`${accounts.length} connected accounts`} />
        </section>

        {activeTab === "advisor" && (
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="text-2xl font-black tracking-tight">Advisor notes</h2>
              <div className="mt-4 space-y-3">
                {advisorNotes.map((note, index) => {
                  const Icon = note.tone === "warning" ? AlertTriangle : note.tone === "good" ? CheckCircle2 : BarChart3;
                  return (
                    <div key={index} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex gap-3">
                        <div className="rounded-2xl bg-white p-2 shadow-sm"><Icon className="h-5 w-5" /></div>
                        <div>
                          <p className="font-black">{note.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{note.body}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 rounded-3xl bg-slate-950 p-4 text-white">
                <h3 className="font-black">Ask the advisor</h3>
                <p className="mt-1 text-sm text-slate-300">Examples: Where did our money go? How should we invest extra cash? Can we afford a house? Claude answers from your synced financial summary.</p>
                <div className="mt-3 flex flex-col gap-2 md:flex-row">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400"
                    placeholder="Ask a finance question..."
                  />
                  <Button onClick={askAdvisor} disabled={isBusy} className="bg-white text-slate-950 hover:bg-slate-100">Ask Claude</Button>
                </div>
                {answer && <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/10 p-3 text-sm leading-6 text-slate-100">{answer}</div>}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-tight">Spending chart</h2>
              <div className="mt-4 h-80">
                {analytics.categoryData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analytics.categoryData} dataKey="value" nameKey="name" outerRadius={105} label />
                      {analytics.categoryData.map((_, index) => <Cell key={index} />)}
                      <Tooltip formatter={(value) => money.format(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    Connect Plaid and sync transactions to see spending.
                  </div>
                )}
              </div>
            </Card>
          </section>
        )}

        {activeTab === "transactions" && (
          <section className="space-y-4">
            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-tight">Connected accounts</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-black">{account.name}</p>
                    <p className="text-sm text-slate-500">{account.subtype || account.type} • ****{account.mask}</p>
                    <p className="mt-2 text-xl font-black">{money.format(account.current_balance || 0)}</p>
                  </div>
                ))}
                {!accounts.length && <p className="text-sm text-slate-500">No accounts connected yet.</p>}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-2xl font-black tracking-tight">Recent transactions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Merchant</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.slice(0, 100).map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 text-slate-500">{tx.date}</td>
                        <td className="px-4 py-3 font-semibold">{tx.merchant_name || tx.name}</td>
                        <td className="px-4 py-3">{tx.category}</td>
                        <td className="px-4 py-3 font-black">{money.format(tx.amount)}</td>
                        <td className="px-4 py-3 text-slate-500">{tx.pending ? "Pending" : "Posted"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {activeTab === "budget" && (
          <section className="space-y-4">
            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-tight">Monthly budget history</h2>
              <p className="mt-1 text-sm text-slate-500">This tracks the current month. The database supports one budget record per month.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Field label="Category">
                  <SelectInput value={newBudget.category} onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })}>
                    {defaultBudgetCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Planned amount">
                  <TextInput type="number" value={newBudget.amount} onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })} />
                </Field>
                <div className="flex items-end"><Button onClick={addBudgetCategory} className="w-full"><Plus className="h-4 w-4" />Add budget</Button></div>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="text-xl font-black">Budget categories</h3>
                <div className="mt-4 space-y-2">
                  {budgetCategories.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                      <div>
                        <p className="font-bold">{row.category}</p>
                        <p className="text-sm text-slate-500">Planned {money.format(row.planned_amount)}</p>
                      </div>
                      <Button variant="ghost" onClick={() => deleteBudgetCategory(row.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-xl font-black">Actual vs budget</h3>
                <div className="mt-4 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetCategories.map((row) => ({
                      category: row.category,
                      Budget: Number(row.planned_amount),
                      Actual: analytics.categoryTotals[row.category] || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis />
                      <Tooltip formatter={(value) => money.format(value)} />
                      <Bar dataKey="Budget" />
                      <Bar dataKey="Actual" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <h3 className="text-xl font-black">Savings goals</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <Field label="Goal"><TextInput value={newGoal.name} onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })} /></Field>
                <Field label="Target"><TextInput type="number" value={newGoal.target} onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })} /></Field>
                <Field label="Current"><TextInput type="number" value={newGoal.current} onChange={(e) => setNewGoal({ ...newGoal, current: e.target.value })} /></Field>
                <Field label="Monthly"><TextInput type="number" value={newGoal.monthly} onChange={(e) => setNewGoal({ ...newGoal, monthly: e.target.value })} /></Field>
                <div className="flex items-end"><Button onClick={addSavingsGoal} className="w-full"><Plus className="h-4 w-4" />Add goal</Button></div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {savingsGoals.map((goal) => (
                  <div key={goal.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black">{goal.name}</p>
                        <p className="text-sm text-slate-500">{money.format(goal.current)} / {money.format(goal.target)}</p>
                        <p className="mt-1 text-sm text-slate-500">{money.format(goal.monthly)} per month</p>
                      </div>
                      <Button variant="ghost" onClick={() => deleteSavingsGoal(goal.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {activeTab === "rules" && (
          <section className="space-y-4">
            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-tight">Custom category rules</h2>
              <p className="mt-1 text-sm text-slate-500">Rules run before default categories. Example pattern: STARBUCKS, category: Eating out / coffee.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Field label="Merchant pattern">
                  <TextInput value={newRule.pattern} onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })} placeholder="STARBUCKS|DUTCH BROS" />
                </Field>
                <Field label="Category">
                  <TextInput value={newRule.category} onChange={(e) => setNewRule({ ...newRule, category: e.target.value })} placeholder="Eating out / coffee" />
                </Field>
                <div className="flex items-end">
                  <Button onClick={addRule} className="w-full"><Plus className="h-4 w-4" />Add rule</Button>
                </div>
              </div>
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
              {rules.map((rule) => (
                <Card key={rule.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{rule.pattern}</p>
                      <p className="text-sm text-slate-500">Category: {rule.category}</p>
                    </div>
                    <Button variant="ghost" onClick={() => deleteRule(rule.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {activeTab === "household" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight"><Users className="h-6 w-6" />Household sharing</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The database supports shared household access through the household_members table. For the first version, invite flow is manual: add your wife's Supabase user ID to this household in the Supabase table. A polished invite-by-email flow can be added next.
              </p>
              <div className="mt-4 rounded-3xl bg-slate-100 p-4 text-sm">
                <p className="font-black">Household</p>
                <p className="text-slate-600">{household.name}</p>
                <p className="mt-2 font-black">Household ID</p>
                <p className="break-all text-slate-600">{household.id}</p>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-tight">Security notes</h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                <p>Plaid access tokens are only stored server-side in Supabase and are never sent to the browser.</p>
                <p>Use Supabase RLS policies to limit household data to household members.</p>
                <p>For production, move Plaid from sandbox to development or production and review Plaid’s compliance requirements.</p>
                <p>This app provides educational financial guidance, not registered investment advice.</p>
              </div>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
