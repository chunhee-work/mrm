// The owner's to-do list, shown at /admin/todo. It is kept here by hand, in plain words:
// add a line when something new is waiting, set `done: true` when it is finished (it then moves to "Done").
// No secrets and no customer details in this file.

/** Who has to move: the owner, or the build (Claude). */
export type Who = "you" | "build";
export type TodoItem = { id: string; title: string; note: string; who: Who; done?: boolean };
export type TodoGroup = { id: string; title: string; items: TodoItem[] };

export const TODO: TodoGroup[] = [
  {
    id: "legal",
    title: "Legal, before real customers",
    items: [
      { id: "merimen-consent", who: "you", title: "Get Merimen's written consent", note: "Their eClaims terms forbid giving an account to a third party without written consent from Fermion Merimen. Ask them directly, or have each customer ask." },
      { id: "lawyer", who: "you", title: "Have a Malaysian lawyer read the Terms and the Privacy notice", note: "Both pages are drafts written without a lawyer. Bring the Merimen terms along." },
      { id: "company", who: "you", title: "Send the real company name, registration number and address", note: "The site still holds placeholders, hidden on the live site. The law wants them shown before real payments are taken." },
      { id: "controller", who: "you", title: "Settle who is responsible for claimant data", note: "The Privacy notice says the adjusting firm decides. It may really be the insurer. A question for the lawyer." },
      { id: "overseas", who: "you", title: "Check consent for data going overseas", note: "Claim files go to AI and hosting outside Malaysia. This is disclosed, but customers may need their insurers' consent." },
      { id: "speed-proof", who: "you", title: "Keep proof for the speed claims", note: "\"12 cases in 60 minutes\" needs a record that shows it really happened." },
      { id: "service-tax", who: "you", title: "Ask an accountant about service tax", note: "Whether it applies to the credit packs, and from what turnover." },
    ],
  },
  {
    id: "answers",
    title: "Waiting for your answer",
    items: [
      { id: "hours", who: "you", title: "Are the contact hours right?", note: "The Contact page says Monday to Friday, 9am to 6pm (MYT). Nobody confirmed this." },
      { id: "refund", who: "you", title: "Is the refund wording right?", note: "Terms now say: credits come back if the fault is ours, other refunds case by case. This is a draft." },
      { id: "desk-entry", who: "you", title: "Keep the \"Check photo names\" button, or hide it for now?", note: "Photo names were right 67% of the time in the last measurement. The button is live on every case." },
      { id: "terms-warning", who: "you", title: "Add a Merimen consent warning to the Terms?", note: "One line telling customers they need Merimen's consent before they let us work in their account." },
      { id: "merimen-name", who: "you", title: "Remove the Merimen name from the whole site?", note: "It is already out of titles and the headline. It still appears where the service is described, with a \"not affiliated\" line." },
      { id: "dev-db", who: "you", title: "Delete the test copy of the database?", note: "The copy named dev-photo-naming was only for testing. Deleting it needs your word." },
    ],
  },
  {
    id: "payments",
    title: "Payments, before going live",
    items: [
      { id: "prices", who: "you", title: "Set the pack prices", note: "Today's prices are placeholders. Set them after real cases show the cost of one case (see Cost)." },
      { id: "toyyibpay", who: "you", title: "Finish the toyyibPay account", note: "The account was under review. FPX payments wait for it." },
      { id: "ls-live", who: "build", title: "Switch Lemon Squeezy from test to live", note: "Copy the three products to live mode, then new keys and a new owner code. Only after the prices are set." },
      { id: "first-payment", who: "you", title: "Make one real payment yourself", note: "The last check before customers pay: the credits must arrive once." },
    ],
  },
  {
    id: "build",
    title: "Build and test",
    items: [
      { id: "real-upload", who: "you", title: "Upload one real case on the live site", note: "Nobody has done a real upload on live yet. It cannot be done from the build side." },
      { id: "auto-read", who: "build", title: "Read the case by itself after upload", note: "Built, but stuck in review. Until it is merged nothing starts on its own after an upload." },
      { id: "photo-model", who: "build", title: "Switch on your own photo model", note: "In review, switched off. Needs a dry run, and your approval for one new database column." },
      { id: "ui-review-key", who: "build", title: "Fix the automatic design review", note: "It shows green without a real review, because the request goes out without its key." },
      { id: "font", who: "build", title: "Stop the random build failures", note: "A build sometimes fails while fetching the font from Google. Keeping the font in the project fixes it." },
    ],
  },
];

export const openItems = (groups: TodoGroup[] = TODO) => groups.flatMap((g) => g.items).filter((i) => !i.done);
