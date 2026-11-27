import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { GUIDE, type GuideCopy } from "@/lib/guide-copy";
import { Bin, Chevron, Photo, Tick, Upload } from "@/components/app/marks";

type Dot = "go" | "wait" | "fail" | "later";
const DOT: Record<Dot, string> = { go: "bg-go text-bay", wait: "bg-amber text-bay", fail: "bg-[#dc2626] text-white", later: "border border-dashed border-mute bg-panel text-mute" };

/** A small step bar, the same colours as the real one: green tick = done, amber = waits for you, red ! = failed, grey = later. */
function Bar({ dots, labels }: { dots: Dot[]; labels?: string[] }) {
  return (
    <ol className="flex items-start" aria-hidden="true">
      {dots.map((d, i) => (
        <li key={i} className="relative flex min-w-0 flex-1 flex-col items-center">
          {i > 0 && <span className={`absolute left-0 top-[13px] h-[3px] w-1/2 -translate-y-1/2 ${dots[i - 1] === "go" ? "bg-go" : "bg-hair2"}`} />}
          {i < dots.length - 1 && <span className={`absolute right-0 top-[13px] h-[3px] w-1/2 -translate-y-1/2 ${d === "go" ? "bg-go" : "bg-hair2"}`} />}
          <span className={`relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-bold ${DOT[d]}`}>
            {d === "go" ? <Tick className="h-3 w-3" /> : d === "fail" ? "!" : i + 1}
          </span>
          {labels && <span className="mt-1.5 max-w-full truncate px-1 text-[12px] text-mute">{labels[i]}</span>}
        </li>
      ))}
    </ol>
  );
}

const card = "rounded-[6px] border border-hair bg-panel";
const chip = "inline-flex items-center rounded-[4px] border border-hair2 bg-bay px-2 py-1 text-[12px] font-medium text-fg";

/** The drawing for one step: plain shapes, no screenshot, so it follows the language and the light theme. */
function Art({ id, c }: { id: "setup" | "docs" | "photos" | "merimen" | "done"; c: GuideCopy }) {
  const d = c.draw;
  if (id === "setup") {
    return (
      <div className="grid gap-2" aria-hidden="true">
        {c.setup.fields.map((f) => (
          <div key={f} className="flex items-center justify-between rounded-[4px] border border-hair2 bg-bay px-3 py-2 text-[13px]">
            <span className="text-mute">{f}</span>
            <span className="h-2 w-16 rounded-full bg-hair2" />
          </div>
        ))}
      </div>
    );
  }
  if (id === "docs") {
    return (
      <div className="grid gap-3" aria-hidden="true">
        <div className="flex flex-col items-center gap-2 rounded-[4px] border border-dashed border-mute px-3 py-4 text-[13px] text-mute">
          <Upload className="h-5 w-5 text-fg" />
          {d.drop}
        </div>
        <div className="flex flex-wrap gap-1.5"><span className={chip}>claim.pdf</span><span className={chip}>police.pdf</span><span className={chip}>JPG × 12</span></div>
      </div>
    );
  }
  if (id === "photos") {
    return (
      <div className="grid gap-3" aria-hidden="true">
        <div className="grid grid-cols-2 gap-2">
          {["Front Bumper", "Bonnet"].map((n) => (
            <div key={n} className="overflow-hidden rounded-[4px] border border-hair2 bg-bay">
              <div className="flex h-16 items-center justify-center bg-panel2 text-mute"><Photo className="h-6 w-6" /></div>
              <div className="px-2 py-1.5 text-[12px] font-medium text-fg">{n}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[12.5px] text-mute"><span>{d.checkNames}</span><span className="rounded-[3px] bg-fg px-3 py-1 text-[12.5px] font-semibold text-bay">{d.doneBtn}</span></div>
      </div>
    );
  }
  if (id === "merimen") {
    return (
      <div className="grid gap-1.5 text-[13px]" aria-hidden="true">
        {[d.signIn, d.parts, d.upload].map((s, i) => (
          <div key={s} className="flex items-center gap-2 rounded-[4px] border border-hair2 bg-bay px-3 py-2">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${i < 2 ? "bg-go text-bay" : "border border-dashed border-mute text-mute"}`}>{i < 2 ? <Tick className="h-3 w-3" /> : <span className="text-[10px]">…</span>}</span>
            {s}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-3" aria-hidden="true">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-go text-bay"><Tick className="h-6 w-6" /></span>
      <span className="text-[14px] font-semibold text-fg">{d.finished}</span>
    </div>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return <ul className="grid gap-1.5 text-[15px] leading-snug text-fg">{lines.map((l) => <li key={l} className="flex gap-2"><span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-mute" />{l}</li>)}</ul>;
}

function Block({ tag, name, lines, art, id, stack }: { tag?: string; name: string; lines: string[]; art?: React.ReactNode; id?: string; stack?: boolean }) {
  return (
    <section id={id} className={`${card} grid content-start gap-5 p-5 sm:p-6 ${art && !stack ? "sm:grid-cols-[1fr_minmax(0,260px)] sm:items-center" : ""}`}>
      <div className="grid gap-3">
        <div>
          {tag && <div className="label mb-1">{tag}</div>}
          <h2 className="text-[20px] font-semibold leading-tight text-fg">{name}</h2>
        </div>
        <Lines lines={lines} />
      </div>
      {art && <div className="min-w-0">{art}</div>}
    </section>
  );
}

export default function Guide({ lang }: { lang: Lang }) {
  const c = GUIDE[lang];
  const names = c.steps.map((s) => s.name);
  const ids = ["docs", "photos", "merimen", "done"] as const;
  return (
    <div className="wrap py-8 lg:py-12" data-testid="how-it-works">
      <header className="mb-8 max-w-[640px]">
        <h1 className="display-2 text-[30px] text-fg lg:text-[36px]">{c.title}</h1>
        <p className="mt-2 text-[16px] text-mute">{c.lead}</p>
      </header>

      <div className={`${card} mb-6 max-w-[760px] px-4 py-5 sm:px-8`} role="img" aria-label={c.stepsLabel}>
        <Bar dots={["go", "go", "wait", "later"]} labels={names} />
      </div>

      <div className="grid max-w-[760px] gap-5">
        <Block tag={c.setup.tag} name={c.setup.name} lines={[...c.setup.lines, c.setup.locked]} art={<Art id="setup" c={c} />} id="setup" />
        {c.steps.map((s, i) => <Block key={s.name} tag={s.tag} name={s.name} lines={s.lines} art={<Art id={ids[i]} c={c} />} id={ids[i]} />)}

        <div className="grid gap-5 sm:grid-cols-2">
          <Block name={c.zip.name} lines={c.zip.lines} id="zip" />
          <Block name={c.missing.name} lines={c.missing.lines} id="missing" />
        </div>

        <Block
          id="list" name={c.list.name} lines={c.list.lines}
          art={
            <div className="grid gap-3" aria-hidden="true">
              <div className="rounded-[4px] border border-hair2 bg-bay p-3">
                <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-fg"><span>WXY 1234</span><Chevron className="text-mute" /></div>
                <Bar dots={["go", "wait", "later", "later"]} />
              </div>
              <div className="rounded-[4px] border border-hair2 bg-bay p-3">
                <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-fg"><span>VBB 5678</span><Chevron className="text-mute" /></div>
                <Bar dots={["go", "go", "go", "fail"]} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-mute">
                {(["go", "wait", "fail", "later"] as Dot[]).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${k === "go" ? "bg-go" : k === "wait" ? "bg-amber" : k === "fail" ? "bg-[#dc2626]" : "border border-dashed border-mute"}`} />{c.list.legend[k]}</span>)}
              </div>
            </div>
          }
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Block name={c.credits.name} lines={c.credits.lines} id="credits" stack art={<div className="rounded-[4px] border border-hair2 bg-bay px-3 py-2.5 text-[14px] font-semibold text-fg" aria-hidden="true">{c.credits.unit}</div>} />
          <Block name={c.remove.name} lines={c.remove.lines} id="remove" stack art={<div className="flex items-center gap-2 text-mute" aria-hidden="true"><Bin className="h-5 w-5" /><span className="text-[13px]">{c.draw.days}</span></div>} />
        </div>
      </div>

      <div className="mt-8">
        <Link href="/dashboard" className="btn-primary inline-flex">{c.cta.cases}</Link>
      </div>
    </div>
  );
}
