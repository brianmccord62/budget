import https from "https";

function getAgent() {
  const cert = (process.env.TELLER_CERT || "").replace(/\\n/g, "\n");
  const key = (process.env.TELLER_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!cert || !key) throw new Error("Missing TELLER_CERT or TELLER_PRIVATE_KEY.");
  return new https.Agent({ cert, key });
}

function tellerRequest(accessToken, path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${accessToken}:`).toString("base64");
    let agent;
    try { agent = getAgent(); } catch (e) { return reject(e); }
    const req = https.request({
      hostname: "api.teller.io",
      path,
      method: "GET",
      agent,
      headers: {
        Authorization: `Basic ${auth}`,
        "Teller-Version": "2020-10-12",
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(data?.error?.message || `Teller ${res.statusCode}`));
          else resolve(data);
        } catch { reject(new Error(`Bad JSON: ${raw}`)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export const getAccounts = (token) => tellerRequest(token, "/accounts");
export const getTransactions = (token, accountId, fromId) =>
  tellerRequest(token, `/accounts/${accountId}/transactions${fromId ? `?from_id=${fromId}` : ""}`);
export const getAccountBalance = (token, accountId) =>
  tellerRequest(token, `/accounts/${accountId}/balances`);
