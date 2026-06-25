import { redirect } from "next/navigation";

// Root landing page — redirects to /login.
// Authenticated users are forwarded to /dashboard by middleware (WU2).
export default function RootPage() {
  redirect("/login");
}
