import Link from "next/link";
import { Chevron } from "./marks";

/**
 * The way back, at the top of a page. It looks like a button, not like a line of text (owner 2026-11-22: "all this back UI
 * make it a button look"), and it is 44px tall, so a thumb finds it.
 */
export default function BackLink({ href, children, className = "", testid }: { href: string; children: React.ReactNode; className?: string; testid?: string }) {
  return (
    <Link
      href={href} data-testid={testid}
      className={`inline-flex h-11 items-center gap-2 self-start rounded-[3px] border border-hair2 bg-panel pl-3 pr-4 text-[15px] font-semibold text-fg transition-colors duration-150 hover:border-ice hover:bg-panel2 ${className}`}
    >
      <Chevron className="rotate-90 text-mute" />{children}
    </Link>
  );
}
