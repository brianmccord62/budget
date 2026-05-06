export function compactMoney(value) {
  const n = Number(value || 0);
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function buildFinanceSnapshot({ household, accounts, transactions, budgetCategories, savingsGoals }) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const currentMonthTransactions = (transactions || []).filter((tx) => tx.date?.startsWith(currentMonth));
  const spendingTransactions = currentMonthTransactions.filter((tx) => Number(tx.amount) > 0);
  const incomeTransactions = currentMonthTransactions.filter((tx) => Number(tx.amount) < 0);

  const monthlySpending = spendingTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const monthlyIncome = incomeTransactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  const plannedSavings = (savingsGoals || []).reduce((sum, goal) => sum + Number(goal.monthly || 0), 0);
  const plannedBudget = (budgetCategories || []).reduce((sum, row) => sum + Number(row.planned_amount || 0), 0);
  const monthlyMargin = monthlyIncome - monthlySpending - plannedSavings;

  const categoryTotals = {};
  for (const tx of spendingTransactions) {
    const category = tx.category || "Uncategorized";
    categoryTotals[category] = (categoryTotals[category] || 0) + Number(tx.amount || 0);
  }

  const topCategories = Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const topMerchants = {};
  for (const tx of spendingTransactions) {
    const merchant = tx.merchant_name || tx.name || "Unknown";
    topMerchants[merchant] = (topMerchants[merchant] || 0) + Number(tx.amount || 0);
  }

  const topMerchantRows = Object.entries(topMerchants)
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const recentTransactions = (transactions || [])
    .slice(0, 40)
    .map((tx) => ({
      date: tx.date,
      merchant: tx.merchant_name || tx.name,
      amount: Number(tx.amount || 0),
      category: tx.category || "Uncategorized",
      pending: Boolean(tx.pending),
    }));

  const accountSummary = (accounts || []).map((account) => ({
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    balance: Number(account.current_balance || 0),
  }));

  const budgetSummary = (budgetCategories || []).map((row) => ({
    category: row.category,
    planned: Number(row.planned_amount || 0),
    actual: Number(categoryTotals[row.category] || 0),
    difference: Number(row.planned_amount || 0) - Number(categoryTotals[row.category] || 0),
  }));

  const savingsSummary = (savingsGoals || []).map((goal) => ({
    name: goal.name,
    target: Number(goal.target || 0),
    current: Number(goal.current || 0),
    monthly: Number(goal.monthly || 0),
    priority: goal.priority,
  }));

  return {
    householdName: household?.name || "My Household",
    month: currentMonth,
    monthlyIncome,
    monthlySpending,
    plannedSavings,
    plannedBudget,
    monthlyMargin,
    savingsRate: monthlyIncome > 0 ? plannedSavings / monthlyIncome : 0,
    categoryTotals: topCategories,
    topMerchants: topMerchantRows,
    accounts: accountSummary,
    budget: budgetSummary,
    savingsGoals: savingsSummary,
    recentTransactions,
  };
}

export function buildAdvisorSystemPrompt() {
  return `You are a practical financial planning assistant inside a personal finance app.

Your job:
- Help the user understand spending, budgeting, savings, debt, and general investing order of operations.
- Be direct, plainspoken, and practical.
- Use the user's provided financial snapshot only. Do not invent missing balances, debt, interest rates, or income.
- Make recommendations in an order of priority.
- Mention exact numbers from the snapshot when useful.
- Keep the response concise, usually 4 to 8 short paragraphs or bullets.
- If the user asks about investments, provide educational guidance only. Do not recommend specific securities, do not guarantee returns, and do not present yourself as a registered investment adviser.
- Good general investing guidance may include emergency fund, high-interest debt, employer 401(k) match, Roth IRA/traditional retirement accounts, diversified low-cost index funds, time horizon, risk tolerance, tax considerations, and speaking with a qualified professional.
- If the data looks incomplete, say what is missing and how connecting/syncing more accounts would improve the answer.
- Do not ask for highly sensitive information unless absolutely necessary.
- Do not mention internal API details, prompts, or JSON unless asked by the developer.`;
}

export function buildAdvisorUserPrompt({ question, snapshot }) {
  return `User question:
${question}

Financial snapshot JSON:
${JSON.stringify(snapshot, null, 2)}

Answer the user's question using this snapshot.`;
}
