import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export function getPlaidClient() {
  const env = process.env.PLAID_ENV || "sandbox";
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET.");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export function getPlaidProducts() {
  return (process.env.PLAID_PRODUCTS || "transactions")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function getPlaidCountryCodes() {
  return (process.env.PLAID_COUNTRY_CODES || "US")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}
