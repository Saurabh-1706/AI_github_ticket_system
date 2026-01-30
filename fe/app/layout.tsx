<<<<<<< HEAD
import "./globals.css";
=======
import "../styles/globals.css";
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
<<<<<<< HEAD
      <body className="bg-zinc-50 text-zinc-900">
        {children}
=======
      <body>
        <div className="min-h-screen flex">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r hidden md:block">
            <div className="p-6 font-bold text-lg">
              Git IntelliSolve
            </div>

            <nav className="px-4 space-y-2 text-sm">
              <a className="block px-3 py-2 rounded hover:bg-slate-100">
                Repository
              </a>
              <a className="block px-3 py-2 rounded hover:bg-slate-100">
                Analyze Issues
              </a>
              <a className="block px-3 py-2 rounded hover:bg-slate-100">
                Duplicates
              </a>
            </nav>
          </aside>

          {/* Main */}
          <main className="flex-1">{children}</main>
        </div>
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
      </body>
    </html>
  );
}
