export const defaultCategoryRules = [
  { pattern: "HEB|H-E-B|KROGER|WALMART|TARGET", category: "Groceries" },
  { pattern: "SHELL|EXXON|CHEVRON|QT|RACEWAY", category: "Gas" },
  { pattern: "CHICK-FIL-A|CHIPOTLE|MCDONALD|STARBUCKS|DUTCH BROS", category: "Eating out / coffee" },
  { pattern: "SPOTIFY|NETFLIX|HULU|DISNEY|APPLE.COM/BILL", category: "Subscriptions" },
  { pattern: "GRACE BIBLE|CHURCH|TITHE", category: "Giving" },
  { pattern: "AMAZON", category: "Shopping" },
  { pattern: "ATM|WITHDRAWAL", category: "Cash" },
];

export function categorizeTransaction(transaction, customRules = []) {
  const name = `${transaction.merchant_name || ""} ${transaction.name || ""}`.toUpperCase();
  const allRules = [...customRules, ...defaultCategoryRules];

  const matched = allRules.find((rule) => {
    try {
      return new RegExp(rule.pattern, "i").test(name);
    } catch {
      return false;
    }
  });

  if (matched) return matched.category;
  return transaction.personal_finance_category?.primary || transaction.category?.[0] || "Uncategorized";
}

export function buildAdvisorNotes({ monthlyIncome, monthlySpending, savingsGoalTotal, categoryTotals }) {
  const notes = [];
  const margin = monthlyIncome - monthlySpending - savingsGoalTotal;
  const eatingOut = categoryTotals["Eating out / coffee"] || 0;
  const groceries = categoryTotals["Groceries"] || 0;
  const housing = categoryTotals["Housing"] || 0;

  if (margin < 0) {
    notes.push({
      tone: "warning",
      title: "You are overcommitted this month",
      body: `Your current plan is short by $${Math.abs(margin).toFixed(0)}. Lower planned savings, trim flexible spending, or add income before the month starts.`,
    });
  } else if (margin < 250) {
    notes.push({
      tone: "warning",
      title: "Your buffer is thin",
      body: `You only have about $${margin.toFixed(0)} left after planned spending and savings. Add more cushion if possible.`,
    });
  } else {
    notes.push({
      tone: "good",
      title: "You have margin",
      body: `You have about $${margin.toFixed(0)} left after the plan. Assign it to emergency savings, debt, investing, or a specific goal.`,
    });
  }

  if (monthlyIncome > 0 && savingsGoalTotal / monthlyIncome < 0.10) {
    notes.push({
      tone: "warning",
      title: "Savings rate is below 10%",
      body: "Start by building toward a 10% savings rate, then work toward 15% or more once your emergency fund is healthy.",
    });
  }

  if (eatingOut > groceries && groceries > 0) {
    notes.push({
      tone: "tip",
      title: "Eating out is higher than groceries",
      body: "This is usually one of the easiest categories to adjust without changing fixed bills.",
    });
  }

  if (monthlyIncome > 0 && housing / monthlyIncome > 0.35) {
    notes.push({
      tone: "warning",
      title: "Housing is above 35% of income",
      body: "That may still be workable, but it means cars, travel, subscriptions, and eating out need tighter boundaries.",
    });
  }

  notes.push({
    tone: "tip",
    title: "Investment guidance guardrail",
    body: "Use this app for education and planning. For exact investment selections, confirm with a qualified professional and consider your risk tolerance, time horizon, taxes, and fees.",
  });

  return notes;
}
