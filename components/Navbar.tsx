"use client";

import { useState } from "react";
import Link from "next/link";
import { ModeToggle } from "@/components/ThemeToggle"

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="font-bold text-lg">
            GitHub AI Solver
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/tickets" className="hover:text-blue-600">
              Tickets
            </Link>
            <Link href="/dashboard" className="hover:text-blue-600">
              Dashboard
            </Link>
            <ModeToggle />
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden rounded-md p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t bg-white dark:bg-gray-900">
          <div className="flex flex-col gap-3 px-4 py-4">
            <Link
              href="/tickets"
              onClick={() => setOpen(false)}
              className="hover:text-blue-600"
            >
              Tickets
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="hover:text-blue-600"
            >
              Dashboard
            </Link>
            <ModeToggle />
          </div>
        </div>
      )}
    </nav>
  );
}
