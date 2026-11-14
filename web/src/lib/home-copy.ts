import type { Lang } from "./i18n";
import { SITE } from "./site";

const B = SITE.brand;

export type DamagedPanel = "grille" | "bumper" | "lampL" | "fenderL" | "bonnet";

export type HomeCopy = {
  hero: { line1: string; line2: string; support: string; how: string; replay: string };
  demo: {
    model: string; kind: string; clock: string;
    parts: { id: DamagedPanel; name: string }[];
    totalLabel: string; total: string;
    figure: string;
  };
  time: {
    title: string; handValue: string; handLabel: string; autoValue: string; autoLabel: string;
    unit: string; yours: string; proof: string;
  };
  how: { title: string; steps: { name: string; line: string }[]; zip: string; or: string; photos: string[]; cases: { name: string; done: boolean }[] };
  keyed: { title: string; items: string[]; signoff: string };
  security: { title: string; items: { name: string; line: string }[] };
  faq: { title: string; items: { q: string; a: string }[] };
  closing: { title: string; talk: string };
};

// Fictional demo case used by the product drawings. Merimen part names stay in English in every language.
const PARTS: HomeCopy["demo"]["parts"] = [
  { id: "grille", name: "Front Grille" },
  { id: "bumper", name: "Front Bumper" },
  { id: "lampL", name: "Headlamp LH" },
  { id: "fenderL", name: "Fender LH" },
  { id: "bonnet", name: "Bonnet" },
];
const PHOTOS = ["Front Bumper", "Bonnet", "Headlamp LH"];
const CASES = [
  { name: "Perodua Myvi 1.5", done: true },
  { name: "Proton Saga 1.3", done: true },
  { name: "Honda City 1.5", done: false },
];

const en: HomeCopy = {
  hero: {
    line1: "Upload the case file.",
    line2: "Merimen fills itself.",
    support: "For Malaysian motor-claim adjusters. Inside your own Merimen account.",
    how: "See how it works",
    replay: "Replay",
  },
  demo: {
    model: "Perodua Myvi 1.5",
    kind: "Own damage",
    clock: "05:00",
    parts: PARTS,
    totalLabel: "Keyed",
    total: "5 parts",
    figure: "Example case, a Perodua Myvi 1.5: five damaged panels are keyed into the parts list in about five minutes.",
  },
  time: {
    title: "Time per case",
    handValue: "15–20",
    handLabel: "by hand",
    autoValue: "5",
    autoLabel: `with ${B}`,
    unit: "min",
    yours: "1 of them yours",
    proof: "12 cases in 60 minutes, measured on a real batch.",
  },
  how: {
    title: "How it works",
    steps: [
      { name: "Upload", line: "Zip, or PDFs + photos." },
      { name: "Confirm", line: "Check the photo names." },
      { name: "Done", line: "The case is in your Merimen." },
    ],
    zip: "case-file.zip",
    or: "or",
    photos: PHOTOS,
    cases: CASES,
  },
  keyed: {
    title: "Keyed for you",
    items: ["Case creation", "Adjuster Report", "Rates & discounts", "Narratives", "Documents", "Photos, named and ordered", "Parts & labour", "Estimate details", "Final checks"],
    signoff: "In your Merimen",
  },
  security: {
    title: "Security",
    items: [
      { name: "Your Merimen login stays yours.", line: "You sign in yourself. We never see your password." },
      { name: "Private by company.", line: "Files and cases are isolated per company." },
      { name: "PDPA 2010.", line: "Handled under Malaysia's Personal Data Protection Act." },
      { name: "You approve first.", line: "No parts are keyed until you confirm the photo names." },
    ],
  },
  faq: {
    title: "FAQ",
    items: [
      { q: "Do you need my Merimen password?", a: `No. You log in to Merimen yourself in a secure browser window. ${B} works inside that session.` },
      { q: "What do I upload?", a: "One zip, or the PDFs (registration card, policy, police reports) and the photos." },
      { q: "How long does a case take?", a: "About 5 minutes of machine time and about a minute of yours." },
      { q: "What if a document is missing?", a: "The case waits and names the missing document. Your other cases carry on." },
      { q: "Which languages?", a: "English, 中文 and Bahasa Melayu." },
    ],
  },
  closing: { title: "Key your next case in 5 minutes.", talk: "Talk to us" },
};

const zh: HomeCopy = {
  hero: {
    line1: "上传案件资料。",
    line2: "Merimen 自动填好。",
    support: "为马来西亚车险理算师而做，就在你自己的 Merimen 账号里。",
    how: "看看怎么用",
    replay: "重播",
  },
  demo: {
    model: "Perodua Myvi 1.5",
    kind: "车损案件",
    clock: "05:00",
    parts: PARTS,
    totalLabel: "已录入",
    total: "5 项零件",
    figure: "示例案件，一辆 Perodua Myvi 1.5：五个受损部位在大约五分钟内录入零件清单。",
  },
  time: {
    title: "每个案件的用时",
    handValue: "15–20",
    handLabel: "人工录入",
    autoValue: "5",
    autoLabel: `用 ${B}`,
    unit: "分钟",
    yours: "其中 1 分钟是你的",
    proof: "实测一批真实案件：60 分钟完成 12 个。",
  },
  how: {
    title: "怎么用",
    steps: [
      { name: "上传", line: "一个 zip，或 PDF 加照片。" },
      { name: "确认", line: "核对照片名称。" },
      { name: "完成", line: "案件已在你的 Merimen 里。" },
    ],
    zip: "case-file.zip",
    or: "或",
    photos: PHOTOS,
    cases: CASES,
  },
  keyed: {
    title: "替你录入",
    items: ["建立案件", "Adjuster Report", "费率与折扣", "案情叙述", "文件", "照片：命名并排序", "零件与工时", "估算明细", "最后检查"],
    signoff: "已在你的 Merimen 里",
  },
  security: {
    title: "安全",
    items: [
      { name: "Merimen 登录只属于你。", line: "你自己登录，我们看不到你的密码。" },
      { name: "每家公司各自独立。", line: "文件和案件按公司隔离。" },
      { name: "PDPA 2010。", line: "依照马来西亚《个人资料保护法》处理。" },
      { name: "先由你确认。", line: "你确认照片名称之前，不会录入任何零件。" },
    ],
  },
  faq: {
    title: "常见问题",
    items: [
      { q: "需要我的 Merimen 密码吗？", a: `不需要。你在安全的浏览器窗口里自己登录 Merimen，${B} 只在这次登录里工作。` },
      { q: "我要上传什么？", a: "一个 zip，或者 PDF（车辆登记卡、保单、警方报告）加照片。" },
      { q: "一个案件要多久？", a: "机器大约 5 分钟，你大约 1 分钟。" },
      { q: "缺文件怎么办？", a: "这个案件会停下来，并写明缺哪一份文件。其他案件照常进行。" },
      { q: "支持哪些语言？", a: "English、中文和 Bahasa Melayu。" },
    ],
  },
  closing: { title: "下一个案件，5 分钟录完。", talk: "联系我们" },
};

const ms: HomeCopy = {
  hero: {
    line1: "Muat naik fail kes.",
    line2: "Merimen terisi sendiri.",
    support: "Untuk penyelaras tuntutan motor di Malaysia. Dalam akaun Merimen anda sendiri.",
    how: "Lihat cara ia berfungsi",
    replay: "Main semula",
  },
  demo: {
    model: "Perodua Myvi 1.5",
    kind: "Kerosakan sendiri",
    clock: "05:00",
    parts: PARTS,
    totalLabel: "Dimasukkan",
    total: "5 alat ganti",
    figure: "Kes contoh, sebuah Perodua Myvi 1.5: lima panel yang rosak dimasukkan ke dalam senarai alat ganti dalam kira-kira lima minit.",
  },
  time: {
    title: "Masa bagi setiap kes",
    handValue: "15–20",
    handLabel: "secara manual",
    autoValue: "5",
    autoLabel: `dengan ${B}`,
    unit: "min",
    yours: "1 minit sahaja masa anda",
    proof: "12 kes dalam 60 minit, diukur pada kelompok kes sebenar.",
  },
  how: {
    title: "Cara ia berfungsi",
    steps: [
      { name: "Muat naik", line: "Satu zip, atau PDF + gambar." },
      { name: "Sahkan", line: "Semak nama gambar." },
      { name: "Siap", line: "Kes sudah ada dalam Merimen anda." },
    ],
    zip: "case-file.zip",
    or: "atau",
    photos: PHOTOS,
    cases: CASES,
  },
  keyed: {
    title: "Dimasukkan untuk anda",
    items: ["Pembukaan kes", "Adjuster Report", "Kadar & diskaun", "Naratif", "Dokumen", "Gambar, dinamakan dan disusun", "Alat ganti & upah kerja", "Butiran anggaran", "Semakan akhir"],
    signoff: "Dalam Merimen anda",
  },
  security: {
    title: "Keselamatan",
    items: [
      { name: "Log masuk Merimen kekal milik anda.", line: "Anda log masuk sendiri. Kami tidak pernah melihat kata laluan anda." },
      { name: "Peribadi mengikut syarikat.", line: "Fail dan kes diasingkan bagi setiap syarikat." },
      { name: "PDPA 2010.", line: "Dikendalikan di bawah Akta Perlindungan Data Peribadi Malaysia." },
      { name: "Anda sahkan dahulu.", line: "Tiada alat ganti dimasukkan sehingga anda mengesahkan nama gambar." },
    ],
  },
  faq: {
    title: "Soalan lazim",
    items: [
      { q: "Adakah anda perlukan kata laluan Merimen saya?", a: `Tidak. Anda log masuk ke Merimen sendiri dalam tetingkap pelayar yang selamat. ${B} bekerja dalam sesi itu.` },
      { q: "Apa yang perlu saya muat naik?", a: "Satu zip, atau PDF (kad pendaftaran, polisi, laporan polis) dan gambar." },
      { q: "Berapa lama satu kes?", a: "Kira-kira 5 minit masa mesin dan kira-kira seminit masa anda." },
      { q: "Bagaimana jika ada dokumen yang tiada?", a: "Kes itu menunggu dan menyatakan dokumen yang tiada. Kes anda yang lain diteruskan." },
      { q: "Bahasa apa yang disokong?", a: "English, 中文 dan Bahasa Melayu." },
    ],
  },
  closing: { title: "Masukkan kes seterusnya dalam 5 minit.", talk: "Hubungi kami" },
};

export const HOME: Record<Lang, HomeCopy> = { en, zh, ms };
