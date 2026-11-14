import { requireAdmin } from "@/lib/admin/auth";

// The gate runs here first so the 404 for outsiders is rendered exactly like any other missing page.
// (Pages call requireAdmin() too: layouts are not re-run on client-side navigation between sibling pages.)
// No metadata at this level on purpose: it would also appear on that 404 and make /admin stand out.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
