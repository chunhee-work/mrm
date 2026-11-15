import { redirect } from "next/navigation";
import AuthLayout from "@/components/auth-layout";
import { pageMeta } from "@/lib/meta";
import { getUserOrNull } from "@/lib/session";

export const generateMetadata = () => pageMeta("signup.title", { desc: "meta.d.signup" });
export { lightViewport as viewport } from "@/lib/theme";

/** Someone who is already signed in has nothing to do here: straight to their cases. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  if (await getUserOrNull()) redirect("/dashboard");
  return <AuthLayout>{children}</AuthLayout>;
}
