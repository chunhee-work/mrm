import type { Viewport } from "next";
import { isAdminRequest, requireAdmin } from "@/lib/admin/auth";
import { AdminTabIcon } from "@/components/tab-icon";
import { lightViewport } from "@/lib/theme";

// The gate runs here first so the 404 for outsiders is rendered exactly like any other missing page.
// (Pages call requireAdmin() too: layouts are not re-run on client-side navigation between sibling pages.)
// No metadata at this level on purpose: it would also appear on that 404 and make /admin stand out.
export const dynamic = "force-dynamic";

// The browser chrome goes white for an admin only. An outsider's 404 keeps the dark one that every other missing page has.
export async function generateViewport(): Promise<Viewport> {
  return (await isAdminRequest()) ? lightViewport : {};
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}<AdminTabIcon /></>;
}
