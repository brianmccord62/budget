"use client";

/**
 * components/TellerConnect.jsx
 *
 * Drop-in replacement for react-plaid-link.
 * Loads the Teller Connect widget from their CDN and opens it on click.
 *
 * Required env vars (Vercel + .env.local):
 *   NEXT_PUBLIC_TELLER_APPLICATION_ID  — your app ID from teller.io dashboard
 *   NEXT_PUBLIC_TELLER_ENV             — "sandbox" | "development" | "production"
 *
 * Usage:
 *   <TellerConnect
 *     userId={user.id}
 *     householdId={householdId}
 *     onSuccess={(data) => console.log(data.institution_name, data.accounts_found)}
 *     onExit={() => console.log("user closed")}
 *     className="your-tailwind-classes"
 *   >
 *     + Connect a Bank
 *   </TellerConnect>
 */

import { useEffect, useCallback } from "react";

export default function TellerConnect({
  userId,
  householdId,
  onSuccess,
  onExit,
  children,
  className,
  disabled,
}) {
  // Load the Teller Connect script once
  useEffect(() => {
    if (document.getElementById("teller-connect-js")) return;
    const script = document.createElement("script");
    script.id = "teller-connect-js";
    script.src = "https://cdn.teller.io/connect/connect.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const open = useCallback(() => {
    if (!window.TellerConnect) {
      console.warn("Teller Connect script not loaded yet — please try again.");
      return;
    }

    window.TellerConnect.setup({
      applicationId: process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID,
      environment: process.env.NEXT_PUBLIC_TELLER_ENV || "production",
      products: ["transactions"],

      onSuccess: async ({ accessToken, enrollment }) => {
        try {
          const res = await fetch("/api/teller/save-enrollment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken,
              enrollment,
              userId,
              householdId,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Enrollment save failed");
          onSuccess?.(data);
        } catch (err) {
          console.error("TellerConnect save error:", err.message);
        }
      },

      onExit: () => {
        onExit?.();
      },
    }).open();
  }, [userId, householdId, onSuccess, onExit]);

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      className={className}
    >
      {children ?? "Connect a Bank Account"}
    </button>
  );
}
