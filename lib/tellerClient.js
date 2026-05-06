/**
 * lib/tellerClient.js
 *
 * Teller API client using mutual TLS (mTLS) + HTTP Basic Auth.
 *
 * Required Vercel environment variables:
 *   TELLER_CERT         — full contents of certificate.pem  (paste with real line breaks)
 *   TELLER_PRIVATE_KEY  — full contents of private_key.pem  (paste with real line breaks)
 */
import https from "https";

function getAgent() {
  // Vercel sometimes stores newlines as \n — normalize both forms
  const cert = (process.env.TELLER_CERT || "").replace(/\\n/g, "\n");
  const key = (process.env.TELLER_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!cert || !key) {
    throw new Error("Missing TELLER_CERT or TELLER_PRIVATE_KEY environment variables.");
  }

  return new https.Agent({ cert, key });
}

function tellerRequest(accessToken, path) {
  return new Promise((resolve, reject) => {
    // Teller uses HTTP Basic Auth: access_token as the username, empty password
    const auth = Buffer.from(`${accessToken}:`).toString("base64");

    let agent;
    try {
      agent = getAgent();
    } catch (e) {
      return reject(e);
    }

    const req = https.request(
      {
        hostname: "api.teller.io",
        path,
        method: "GET",
        agent,
        headers: {
          Authorization: `Basic ${auth}`,
          "Teller-Version": "2020-10-12",
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(raw);
            if (res.statusCode >= 400) {
              reject(
                new Error(data?.error?.message || `Teller error ${res.statusCode}: ${raw}`)
              );
            } else {
              resolve(data);
            }
          } catch {
            reject(new Error(`Invalid JSON from Teller API: ${raw}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

/**
 * Returns all accounts for an enrollment access token.
 */
export function getAccounts(accessToken) {
  return tellerRequest(accessToken, "/accounts");
}

/**
 * Returns transactions for one account, newest first.
 * Pass fromId to paginate — Teller returns transactions older than that ID.
 */
export function getTransactions(accessToken, accountId, fromId) {
  const qs = fromId ? `?from_id=${fromId}` : "";
  return tellerRequest(accessToken, `/accounts/${accountId}/transactions${qs}`);
}

/**
 * Returns the live balance for one account.
 */
export function getAccountBalance(accessToken, accountId) {
  return tellerRequest(accessToken, `/accounts/${accountId}/balances`);
}
