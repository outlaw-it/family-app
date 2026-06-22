import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Brain",
  description: "A private second-brain chat app for a household (local demo).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
