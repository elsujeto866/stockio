import { requireUser } from '@/lib/auth/get-user';

/**
 * Protected shell layout for all (app) routes.
 * Calls requireUser() which redirects unauthenticated visitors to /login.
 * Belt-and-suspenders with the middleware matcher — one of the two will
 * catch an unauthenticated request even if the other is misconfigured.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
