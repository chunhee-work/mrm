import { requireAdmin } from "@/lib/admin/auth";
import { TODO, openItems, type TodoItem } from "@/lib/admin/todo";
import { IconOk, IconTodo } from "../_icons";
import { Card, Shell, readSp, type Sp } from "../_ui";

function Who({ who }: { who: TodoItem["who"] }) {
  return who === "you"
    ? <span className="shrink-0 rounded-full bg-ambertint px-2 py-0.5 text-[12px] font-semibold text-amber">You</span>
    : <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[12px] font-semibold text-mute">Build</span>;
}

function Row({ item }: { item: TodoItem }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {item.done
        ? <IconOk className="mt-0.5 text-go" />
        : <span className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px] border-hair2" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-medium ${item.done ? "text-mute line-through" : "text-fg"}`}>{item.title}</p>
        {item.done ? null : <p className="mt-0.5 text-[13px] leading-relaxed text-mute">{item.note}</p>}
      </div>
      {item.done ? null : <Who who={item.who} />}
    </li>
  );
}

export default async function Todo({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const open = openItems();
  const mine = open.filter((i) => i.who === "you").length;
  const done = TODO.flatMap((g) => g.items).filter((i) => i.done);
  return (
    <Shell current="todo" scope={scope} title="To-do">
      <div className="grid gap-4">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-mute">
          <span><span className="num text-[15px] font-semibold text-fg">{open.length}</span> open</span>
          <span className="flex items-center gap-2"><Who who="you" /><span><span className="num font-semibold text-fg">{mine}</span> need you</span></span>
          <span className="flex items-center gap-2"><Who who="build" /><span><span className="num font-semibold text-fg">{open.length - mine}</span> are on the build side</span></span>
        </p>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {TODO.map((g) => {
            const items = g.items.filter((i) => !i.done);
            if (!items.length) return null;
            return (
              <Card key={g.id} icon={<IconTodo />} title={g.title} count={items.length}>
                <ul className="-my-1 divide-y divide-hairsoft">{items.map((i) => <Row key={i.id} item={i} />)}</ul>
              </Card>
            );
          })}
        </div>
        {done.length ? (
          <Card icon={<IconOk />} title="Done">
            <ul className="-my-1 divide-y divide-hairsoft">{done.map((i) => <Row key={i.id} item={i} />)}</ul>
          </Card>
        ) : null}
      </div>
    </Shell>
  );
}
