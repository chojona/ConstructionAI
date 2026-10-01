import type { Metadata } from "next";
import Link from "next/link";
import { HardHat } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Construction AI", template: "%s · Construction AI" },
  description: "Trustworthy construction project intelligence from source documents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="topbar-inner">
              <Link href="/projects" className="brand"><span className="brand-mark"><HardHat size={17} /></span>Construction AI</Link>
              <span className="topbar-note">Source Intelligence</span>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
