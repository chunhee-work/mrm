import "server-only";
import { PLAYBOOK_FILES, PLAYBOOK_VERSION } from "./generated";

// The owner's playbook, as the AI on the site reads it (plan: owner 2026-11-22). The prose is a committed copy of playbook/*.md
// (scripts/sync-playbook.mjs; CI fails when it differs from the repo), so the site follows the same rules as the Mac tools.

export type PlaybookKind = "read_docs" | "name_photos" | "step2";
const SECTIONS: Record<PlaybookKind, string[]> = {
  read_docs: ["01-read-documents.md"],
  name_photos: ["03-photo-naming.md", "11-car-logos.md"],
  step2: ["07-select-parts-and-labour.md", "08-estimate-details.md", "10-car-models.md"],
};

/** `<content version>@<commit>`: the version is the hash of the copied files, the commit is the deploy that is running. */
export function playbookTag(env: Record<string, string | undefined> = process.env): string {
  const sha = (env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || "").slice(0, 7);
  return `${PLAYBOOK_VERSION}@${sha || "local"}`;
}

/**
 * The playbook sections for one kind of prompt, as ONE text block that never changes between calls (so it sits in the cached part of the
 * system prompt). Tool, artifact, Mac and Merimen-clicking instructions in the files do not apply to the site: said so in the header.
 */
export function playbookBlock(kind: PlaybookKind): string {
  const parts = SECTIONS[kind].map((f) => `<playbook_file name="${f}">\n${PLAYBOOK_FILES[f]}\n</playbook_file>`);
  return [
    `The owner's playbook (version ${PLAYBOOK_VERSION}). These are the owner's own rules for this work: follow them.`,
    "Parts that tell a person or a Mac script what to run, publish, click, upload or write to a file do not apply to you: use only the rules about what the documents mean, how parts are named and which parts to select.",
    "If a playbook line and the Answer section of this prompt disagree about the output format or the confidence scale, the Answer section wins.",
    ...parts,
  ].join("\n\n");
}
