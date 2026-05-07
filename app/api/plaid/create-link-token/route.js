import { NextResponse } from "next/server";
import { getPlaidClient, getPlaidProducts, getPlaidCountryCodes } from "@/lib/plaidClient";

export async function POST(request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }

    const plaid = getPlaidClient();

    const response = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Financial Advisor",
      products: getPlaidProducts(),
      country_codes: getPlaidCountryCodes(),
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("create-link-token error", error?.response?.data || error);
    return NextResponse.json(
      { error: "Could not create Plaid link token." },
      { status: 500 }
    );
  }
}
