import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { PAGE, usersList } from "@/lib/admin/queries";
import { Shell, Table, Tag, int, readSp, usd, when, type Sp } from "../_ui";

export default async function Users({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope, q, page } = await readSp(searchParams);
  const r = await usersList(scope, q, page);
  const base = (p: number) => `?${new URLSearchParams({ ...(scope.includeInternal ? { internal: "1" } : {}), ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <Shell current="users" scope={scope}>
      <form className="mb-4 flex gap-2" role="search">
        {scope.includeInternal ? <input type="hidden" name="internal" value="1" /> : null}
        <input name="q" defaultValue={q} placeholder="Search email or name" aria-label="Search users" className="min-w-0 flex-1 rounded-[4px] border border-hair bg-white px-3 py-2 text-[15px]" />
        <button className="rounded-[4px] bg-ink px-4 py-2 text-[14px] font-medium text-white">Search</button>
      </form>
      <p className="note mb-2 text-mute">{int(r.total)} {r.total === 1 ? "user" : "users"}{q ? ` matching “${q}”` : ""}, newest first</p>
      <Table rowKey={(u) => u.id} rows={r.rows} empty="No users yet" height="max-h-[560px]" cols={[
        { label: "Email", cell: (u) => <Link className="text-ink underline" href={`/admin/users/${u.id}${scope.includeInternal ? "?internal=1" : ""}`}>{u.email}</Link> },
        { label: "Name", cell: (u) => u.name },
        { label: "Status", cell: (u) => (u.verified ? <Tag>verified</Tag> : <Tag warn>unverified</Tag>) },
        { label: "Signed up", cell: (u) => when(u.createdAt) },
        { label: "Last seen (session activity)", cell: (u) => when(u.lastSeen) },
        { label: "Cases", cell: (u) => int(u.cases), right: true },
        { label: "Claude cost", cell: (u) => usd(u.cost), right: true },
      ]} />
      <div className="mt-3 flex justify-between">
        {page > 0 ? <Link className="note text-ink underline" href={base(page - 1)}>Newer</Link> : <span />}
        {(page + 1) * PAGE < r.total ? <Link className="note text-ink underline" href={base(page + 1)}>Older</Link> : <span />}
      </div>
    </Shell>
  );
}
