"use client";

import { Inter } from "next/font/google";
import { usePathname } from "next/navigation";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import Sidebar from "./components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Hide sidebar on auth pages
  const isAuthPage = pathname === "/login" || pathname === "/register";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Git IntelliSolve - AI-Powered GitHub Issue Analysis</title>
        <meta name="description" content="Analyze GitHub issues with AI-powered insights and solutions" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
              {/* Conditionally render Sidebar */}
              {!isAuthPage && <Sidebar />}
              
              {/* Main Content */}
              <main className={`flex-1 ${!isAuthPage ? "lg:ml-64" : ""}`}>
                {children}
              </main>
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
