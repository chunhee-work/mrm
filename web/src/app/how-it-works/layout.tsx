import { getUserOrNull } from "@/lib/session";
import AppLayout from "@/components/app-layout";
import SubpageLayout from "@/components/subpage-layout";
import { lightViewport } from "@/lib/theme";
import type { Viewport } from "next";

export async function generateViewport(): Promise<Viewport> {
  return (await getUserOrNull()) ? lightViewport : {};
}

/** One address, two frames: signed in (on the app host) it is the white working frame with the app bar; signed out it is the public page. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull();
  return me ? <AppLayout>{children}</AppLayout> : <SubpageLayout>{children}</SubpageLayout>;
}
