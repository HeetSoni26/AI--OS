import { requireOwner } from "@/lib/auth/guards";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppShell } from "@/components/shell/app-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

type ProtectedLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const owner = await requireOwner();

  return (
    <QueryProvider>
      <AppShell owner={owner}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppShell>
    </QueryProvider>
  );
}
