import "./globals.css";

export const metadata = {
  title: "Connected Financial Advisor",
  description: "A Plaid and Supabase powered finance dashboard.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
