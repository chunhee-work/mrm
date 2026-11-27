import type { Lang } from "./i18n";

/**
 * Words of the signed-in "How it works" page (/how-it-works on the app host). Short lines on purpose: no sentence over one breath.
 * Merimen part names and plates in the drawings stay in English in every language. Kept out of i18n.ts so the page is one file to review.
 */
export type GuideCopy = {
  title: string;
  lead: string;
  stepsLabel: string;
  setup: { tag: string; name: string; lines: string[]; fields: string[]; locked: string };
  steps: { tag: string; name: string; lines: string[] }[];
  zip: { name: string; lines: string[] };
  missing: { name: string; lines: string[] };
  list: { name: string; lines: string[]; legend: { go: string; wait: string; fail: string; later: string } };
  credits: { name: string; lines: string[]; unit: string };
  remove: { name: string; lines: string[] };
  draw: { newCase: string; drop: string; done: string; doneBtn: string; signIn: string; parts: string; upload: string; finished: string; checkNames: string; left: string };
  cta: { start: string; cases: string };
};

const en: GuideCopy = {
  title: "How it works",
  lead: "Four steps from case file to Merimen. About a minute of your time.",
  stepsLabel: "The four steps",
  setup: {
    tag: "Once",
    name: "Your details & workshop",
    lines: [
      "Fill this in once, on the front page.",
      "We remember it for your account.",
      "No case can start until it is complete.",
      "You can edit it any time.",
    ],
    fields: ["Merimen login", "Manager", "Adjuster", "Workshop 1–3"],
    locked: "Pick a workshop for each case. It is fixed once Merimen starts.",
  },
  steps: [
    { tag: "Step 1", name: "Documents", lines: ["Press New case, or drop files on the page.", "The upload starts at once.", "One zip, or PDFs and photos.", "We read the documents for you."] },
    { tag: "Step 2", name: "Name photos", lines: ["Each damage photo gets a part name.", "Check the names. Fix any that are wrong.", "Press Done."] },
    { tag: "Step 3", name: "Merimen", lines: ["We sign in to your own Merimen account.", "The claim is keyed in for you.", "Nothing for you to do."] },
    { tag: "Step 4", name: "Finished", lines: ["The case is done.", "Open it to see the result."] },
  ],
  zip: { name: "A zip with several cars", lines: ["Each car folder becomes its own case.", "1 credit per car.", "Upload that zip on its own."] },
  missing: { name: "A document is missing?", lines: ["The case waits and names what is missing.", "Add it on the case page.", "Your other cases carry on."] },
  list: {
    name: "Your cases, one page",
    lines: ["One line per case, with its own step bar.", "Press a line to open its details right there.", "Cases waiting for you come first.", "Use the search to find a case."],
    legend: { go: "Done", wait: "Waiting for you", fail: "Failed", later: "Later" },
  },
  credits: { name: "Credits", lines: ["Each case uses 1 case of credit.", "Your balance is in the sidebar.", "Buy more any time in Billing."], unit: "cases" },
  remove: { name: "Delete a case", lines: ["The case leaves your list.", "Nothing is sent to Merimen.", "A credit comes back only if the documents were not read yet.", "Its files are wiped after 7 days."] },
  draw: { newCase: "New case", drop: "Drop files here", done: "Done", doneBtn: "Done", signIn: "Sign in", parts: "Parts list", upload: "Photos", finished: "Finished", checkNames: "Check the names", left: "left" },
  cta: { start: "Start a case", cases: "Back to my cases" },
};

const zh: GuideCopy = {
  title: "怎么用",
  lead: "四步，从案件文件到 Merimen。你只需花大约一分钟。",
  stepsLabel: "四个步骤",
  setup: {
    tag: "只填一次",
    name: "你的资料与修车厂",
    lines: ["在首页填一次。", "我们为你的账号记住。", "填完整之前，不能开始案件。", "随时可以修改。"],
    fields: ["Merimen 登录", "Manager", "Adjuster", "修车厂 1–3"],
    locked: "每个案件各选一个修车厂。Merimen 开始后就固定了。",
  },
  steps: [
    { tag: "第 1 步", name: "文件", lines: ["按「新案件」，或把文件拖到页面上。", "马上开始上传。", "一个 zip，或 PDF 加照片。", "文件由我们帮你读。"] },
    { tag: "第 2 步", name: "命名照片", lines: ["每张损坏照片都有一个部件名。", "检查名称，不对的改一下。", "按「完成」。"] },
    { tag: "第 3 步", name: "Merimen", lines: ["我们登录你自己的 Merimen 账号。", "替你录入理赔。", "你不用做什么。"] },
    { tag: "第 4 步", name: "已完成", lines: ["案件完成。", "打开就能看到结果。"] },
  ],
  zip: { name: "一个 zip 里有多辆车", lines: ["每个车辆文件夹变成一个案件。", "每辆车 1 点。", "这种 zip 请单独上传。"] },
  missing: { name: "缺了文件？", lines: ["案件会暂停，并写明缺什么。", "到案件页补上。", "你的其他案件照常进行。"] },
  list: {
    name: "所有案件，一页看完",
    lines: ["每个案件一行，各有自己的步骤条。", "点一行，细节就在原地展开。", "等你处理的案件排在最前。", "用搜索找案件。"],
    legend: { go: "已完成", wait: "等你处理", fail: "失败", later: "之后" },
  },
  credits: { name: "点数", lines: ["每个案件用 1 个案件的点数。", "余额在侧边栏。", "随时到「账单」充值。"], unit: "个案件" },
  remove: { name: "删除案件", lines: ["案件会从你的列表消失。", "不会发送任何东西到 Merimen。", "只有文件还没被读取时，才会退回 1 点。", "文件在 7 天后清除。"] },
  draw: { newCase: "新案件", drop: "把文件拖到这里", done: "完成", doneBtn: "完成", signIn: "登录", parts: "部件清单", upload: "照片", finished: "已完成", checkNames: "检查名称", left: "剩余" },
  cta: { start: "开始一个案件", cases: "回到我的案件" },
};

const ms: GuideCopy = {
  title: "Cara ia berfungsi",
  lead: "Empat langkah dari fail kes ke Merimen. Anda hanya perlu seminit.",
  stepsLabel: "Empat langkah",
  setup: {
    tag: "Sekali sahaja",
    name: "Butiran & bengkel anda",
    lines: ["Isi sekali sahaja, di halaman depan.", "Kami ingat untuk akaun anda.", "Kes tidak boleh bermula sehingga lengkap.", "Anda boleh ubah bila-bila masa."],
    fields: ["Log masuk Merimen", "Manager", "Adjuster", "Bengkel 1–3"],
    locked: "Pilih satu bengkel untuk setiap kes. Ia dikunci apabila Merimen bermula.",
  },
  steps: [
    { tag: "Langkah 1", name: "Dokumen", lines: ["Tekan Kes baharu, atau letak fail di halaman.", "Muat naik bermula serta-merta.", "Satu zip, atau PDF dan gambar.", "Kami bacakan dokumen untuk anda."] },
    { tag: "Langkah 2", name: "Namakan gambar", lines: ["Setiap gambar kerosakan diberi nama bahagian.", "Semak nama. Betulkan yang salah.", "Tekan Selesai."] },
    { tag: "Langkah 3", name: "Merimen", lines: ["Kami log masuk ke akaun Merimen anda sendiri.", "Tuntutan dimasukkan untuk anda.", "Anda tidak perlu buat apa-apa."] },
    { tag: "Langkah 4", name: "Selesai", lines: ["Kes sudah siap.", "Buka untuk lihat hasilnya."] },
  ],
  zip: { name: "Zip dengan beberapa kereta", lines: ["Setiap folder kereta jadi satu kes.", "1 kredit setiap kereta.", "Muat naik zip itu secara berasingan."] },
  missing: { name: "Ada dokumen tidak cukup?", lines: ["Kes menunggu dan menyebut apa yang kurang.", "Tambah di halaman kes.", "Kes lain anda diteruskan."] },
  list: {
    name: "Semua kes, satu halaman",
    lines: ["Satu baris setiap kes, dengan bar langkah sendiri.", "Tekan baris untuk buka butiran di situ juga.", "Kes yang menunggu anda di atas.", "Guna carian untuk cari kes."],
    legend: { go: "Selesai", wait: "Menunggu anda", fail: "Gagal", later: "Kemudian" },
  },
  credits: { name: "Kredit", lines: ["Setiap kes guna kredit 1 kes.", "Baki anda ada di bar sisi.", "Beli lagi bila-bila masa di Bil."], unit: "kes" },
  remove: { name: "Padam kes", lines: ["Kes keluar dari senarai anda.", "Tiada apa dihantar ke Merimen.", "Kredit dipulangkan hanya jika dokumen belum dibaca.", "Failnya dipadam selepas 7 hari."] },
  draw: { newCase: "Kes baharu", drop: "Letak fail di sini", done: "Selesai", doneBtn: "Selesai", signIn: "Log masuk", parts: "Senarai bahagian", upload: "Gambar", finished: "Selesai", checkNames: "Semak nama", left: "baki" },
  cta: { start: "Mulakan kes", cases: "Kembali ke kes saya" },
};

export const GUIDE: Record<Lang, GuideCopy> = { en, zh, ms };
