import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { PAGE, usersList } from "@/lib/admin/queries";
import { IconNext, IconPrev, IconSearch } from "../_icons";
import { Check, Shell, Table, ago, int, readSp, usd, when, withScope, type Sp } from "../_ui";

export default async function Users({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope, q, page } = await readSp(searchParams);
  const r = await usersList(scope, q, page);
  const base = (p: number) => `?${new URLSearchParams({ ...(scope.includeInternal ? { internal: "1" } : {}), ...(q ? { q } : {}), page: String(p) })}`;
  const from = r.total ? page * PAGE + 1 : 0, to = Math.min(r.total, (page + 1) * PAGE);
  const step = "flex h-9 w-9 items-center justify-center rounded-[3px] border border-hair bg-panel";
  return (
    <Shell current="users" scope={scope} title="Users">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form className="relative min-w-0 flex-1 sm:max-w-sm" role="search">
          {scope.includeInternal ? <input type="hidden" name="internal" value="1" /> : null}
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input name="q" type="search" defaultValue={q} placeholder="Name or email" aria-label="Search users" className="h-10 w-full rounded-[3px] border border-hair bg-panel pl-10 pr-3 text-[15px] placeholder:text-mute" />
        </form>
        <div className="ml-auto flex items-center gap-2">
          <span className="num text-[13px] text-mute">{int(from)}–{int(to)} of {int(r.total)}</span>
          {page > 0 ? <Link href={base(page - 1)} aria-label="Newer users" className={`${step} hover:border-ice`}><IconPrev /></Link> : <span className={`${step} opacity-35`}><IconPrev /></span>}
          {(page + 1) * PAGE < r.total ? <Link href={base(page + 1)} aria-label="Older users" className={`${step} hover:border-ice`}><IconNext /></Link> : <span className={`${step} opacity-35`}><IconNext /></span>}
        </div>
      </div>
      <Table rowKey={(u) => u.id} rows={r.rows} empty={q ? `No one matches “${q}”` : "No users yet"} height="max-h-[640px]" cols={[
        { label: "User", cell: (u) => (
          <Link href={withScope(`/admin/users/${u.id}`, scope)} className="group block">
            <span className="block font-medium text-fg group-hover:underline">{u.name || u.email}</span>
            <span className="block text-[13px] font-normal text-mute">{u.email}</span>
          </Link>
        ) },
        { label: "Email", cell: (u) => (u.verified ? <Check ok>Verified</Check> : <Check ok={false}>Not verified</Check>) },
        { label: "Joined", cell: (u) => when(u.createdAt) },
        { label: "Last seen", cell: (u) => ago(u.lastSeen) },
        { label: "Cases", cell: (u) => int(u.cases), right: true },
        { label: "AI cost", cell: (u) => usd(u.cost), right: true },
      ]} />
    </Shell>
  );
}
