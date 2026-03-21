import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold">
            ClipMind
          </Link>
          <div className="flex gap-4">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/dashboard/settings" className="text-sm text-muted-foreground hover:text-foreground">
              Settings
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
