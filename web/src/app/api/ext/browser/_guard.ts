import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";

/** Signed in, and the feature fully on for this org (env switch, org row with consent reference, customer acknowledgement). */
export async function guard() {
  const me = await getUserOrNull();
  if (!me) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  if ((await getExtState(me.orgId)) !== "ready") return { res: NextResponse.json({ error: "disabled" }, { status: 403 }) } as const;
  return { me } as const;
}
