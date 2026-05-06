import { NextResponse } from "next/server";
import { Products, CountryCode } from "plaid";
import { getPlaidClient, getPlaidProducts, getPlaidCountryCodes } from "@/lib/plaidClient";

export async function POST(request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }

    const plaidClient = getPlaidClient();

    const products = getPlaidProducts().map((product) => Products[product] || product);
    const countryCodes = getPlaidCountryCodes().map((code) => CountryCode[code] || code);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Personal Financial Advisor",
      products,
      country_codes: countryCodes,
      language: "en",
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("create-link-token error", error?.response?.data || error);
    return NextResponse.json({ error: "Could not create Plaid link token." }, { status: 500 });
  }
}
