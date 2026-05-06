# Connected Financial Advisor with Plaid and Supabase

This is Phase 2 of the financial advisor app. It adds the five major pieces needed for a Rocket Money-style foundation:

1. Login
2. Cloud database
3. Server-side Plaid access token storage
4. Shared household structure
5. Transaction history, custom categories, and monthly budget history

It also includes Plaid Link, transaction sync, account balance display, custom category rules, monthly budgets, savings goals, and a basic advisor question box.

## Important

This is a starter app, not a finished consumer fintech product. Before production, you should add:
- Production-grade error handling
- Plaid webhooks
- Token encryption or a managed secrets approach
- Invite-by-email household sharing
- Formal privacy policy and terms
- More robust AI advisor guardrails
- Compliance review if you provide personalized investment advice

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Copy your project URL, anon key, and service role key into `.env.local`.
3. Open Supabase SQL Editor.
4. Run `supabase/schema.sql`.
5. Enable email/password auth in Supabase Auth settings.

## Plaid setup

1. Create a Plaid developer account.
2. Use Sandbox first.
3. Copy your Plaid client ID and sandbox secret into `.env.local`.
4. Keep `PLAID_ENV=sandbox`.
5. Run the app and click **Connect bank**.
6. Use Plaid sandbox credentials when prompted.

Common Plaid sandbox credentials:
- username: `user_good`
- password: `pass_good`

## Vercel deployment

1. Push this folder to GitHub.
2. Import the GitHub repo into Vercel.
3. Add the same environment variables in Vercel Project Settings.
4. Deploy.

## Notes on data flow

- The browser requests a Plaid link token from `/api/plaid/create-link-token`.
- Plaid Link gives the browser a short-lived public token.
- The browser sends that public token to `/api/plaid/exchange-public-token`.
- The server exchanges it for a Plaid access token.
- The access token is stored server-side in Supabase.
- `/api/plaid/sync-transactions` pulls transactions and accounts and stores them in Supabase.

## Investment questions

The app can give educational guidance and help you think through order of operations, budgeting, savings rate, debt, and broad investing concepts. It should not claim to be a registered investment adviser or provide guaranteed investment recommendations.


## Claude AI advisor setup

This version includes a server-side Claude advisor route at:

```txt
/app/api/advisor/ask/route.js
```

Add these variables to `.env.local`:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

Also add the same variables in Vercel:

1. Open your Vercel project.
2. Go to Settings.
3. Go to Environment Variables.
4. Add `ANTHROPIC_API_KEY`.
5. Add `ANTHROPIC_MODEL`.
6. Redeploy.

The Claude key is only used on the server. It is not exposed to the browser.

### How the AI advisor works

The browser sends your question to `/api/advisor/ask`.
The server verifies that your user belongs to the household.
The server pulls summarized finance data from Supabase.
The server sends the summary and question to Claude.
Claude returns practical financial guidance.

The route intentionally sends a summarized snapshot, not every raw detail unless it is needed for context.

### Financial guidance note

The AI advisor is designed for budgeting, spending analysis, savings planning, and educational investing guidance. It should not be treated as a registered investment adviser and should not guarantee returns or tell you to buy/sell exact securities.
