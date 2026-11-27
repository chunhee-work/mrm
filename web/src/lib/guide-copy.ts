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
  draw: { days: string; drop: string; doneBtn: string; signIn: string; parts: string; upload: string; finished: string; checkNames: string };
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
    locked: "Choose one workshop on each case. It cannot be changed once Step 3 (Merimen) begins.",
  },
  steps: [
    { tag: "Step 1", name: "Documents", lines: ["Press New case and pick files, or drop them on the front page.", "They upload at once.", "One zip, or PDFs and photos.", "We read the documents for you."] },
    { tag: "Step 2", name: "Name photos", lines: ["We suggest a part name for each damage photo.", "Check the names. Fix any that are wrong.", "Then press Done."] },
    { tag: "Step 3", name: "Merimen", lines: ["We sign in to your own Merimen account.", "The claim is keyed in for you.", "Nothing for you to do.", "This step is ticked when the case is finished."] },
    { tag: "Step 4", name: "Finished", lines: ["The case is done.", "Open it to see the result."] },
  ],
  zip: { name: "A zip with several cars", lines: ["Each car folder becomes its own case.", "Each car is charged as one case.", "Upload that zip on its own, without other files.", "Check the cars, then press Upload."] },
  missing: { name: "A document is missing?", lines: ["The case waits and names what is missing.", "Add it on the case page.", "Your other cases carry on."] },
  list: {
    name: "Your cases, one page",
    lines: ["One line per case, with its own step bar.", "Press a line to open its details right there.", "Cases waiting for you come first.", "Use the search to find a case."],
    legend: { go: "Finished", wait: "Waiting for you", fail: "Failed", later: "Not yet" },
  },
  credits: { name: "Credits", lines: ["Each case costs 1,000 credits.", "Your balance is in Billing.", "Buy more any time."], unit: "1 case = 1,000 credits" },
  remove: { name: "Delete a case", lines: ["The case leaves your list.", "Nothing is sent to Merimen.", "A credit comes back only if the documents were not read yet.", "Its files are wiped after 7 days.", "Not possible once the case is in Merimen."] },
  draw: { days: "7 days", drop: "Drop files here", doneBtn: "Done", signIn: "Sign in", parts: "Parts list", upload: "Photos", finished: "Finished", checkNames: "Check the names" },
  cta: { start: "Start a case", cases: "Back to my cases" },
};

const zh: GuideCopy = {
  title: "怎么用",
  lead: "四步，从案件文件到 Merimen。你只需花大约一分钟。",
  stepsLabel: "四个步骤",
  setup: {
    tag: "只填一次",
    name: "你的资料与工坊",
    lines: ["在首页填一次。", "我们会记住，以后不用再填。", "填完整之前，不能开始案件。", "随时可以修改。"],
    fields: ["Merimen 登录", "经理", "理算员", "工坊 1–3"],
    locked: "在每个案件里选一个工坊。第 3 步（Merimen）开始后就不能改了。",
  },
  steps: [
    { tag: "第 1 步", name: "文件", lines: ["按「新建案件」选文件，或把文件拖到首页。", "选好或拖入后马上上传。", "一个 zip，或 PDF 加照片。", "文件由我们帮你读。"] },
    { tag: "第 2 步", name: "命名照片", lines: ["我们先给每张车损照片起好部件名。", "检查名称，不对的改一下。", "然后按「完成」。"] },
    { tag: "第 3 步", name: "Merimen", lines: ["我们登录你自己的 Merimen 账号。", "替你录入索赔。", "你不用做什么。", "案件完成后这一步才会打勾。"] },
    { tag: "第 4 步", name: "已完成", lines: ["案件完成。", "打开就能看到结果。"] },
  ],
  zip: { name: "一个 zip 里有多辆车", lines: ["每个车辆文件夹变成一个案件。", "每辆车按一个案件扣点。", "这种 zip 请单独上传，不要加其他文件。", "确认车辆后，按「上传」。"] },
  missing: { name: "缺了文件？", lines: ["案件会暂停，并写明缺什么。", "到案件页补上。", "你的其他案件照常进行。"] },
  list: {
    name: "所有案件，一页看完",
    lines: ["每个案件一行，各有自己的步骤条。", "点一行，细节就在原地展开。", "等你处理的案件排在最前。", "用搜索找案件。"],
    legend: { go: "已完成", wait: "等你处理", fail: "失败", later: "还没到" },
  },
  credits: { name: "点数", lines: ["每个案件扣 1,000 点。", "余额在「账单」里。", "随时可以充值。"], unit: "1 个案件 = 1,000 点" },
  remove: { name: "删除案件", lines: ["案件会从你的列表消失。", "不会发送任何东西到 Merimen。", "只有文件还没被读取时，才会退回 1 点。", "文件在 7 天后清除。", "案件进入 Merimen 后不能再删除。"] },
  draw: { days: "7 天", drop: "把文件拖到这里", doneBtn: "完成", signIn: "登录", parts: "部件清单", upload: "照片", finished: "已完成", checkNames: "检查名称" },
  cta: { start: "开始一个案件", cases: "回到我的案件" },
};

const ms: GuideCopy = {
  title: "Cara ia berfungsi",
  lead: "Empat langkah dari fail kes ke Merimen. Anda hanya perlu luangkan kira-kira seminit.",
  stepsLabel: "Empat langkah",
  setup: {
    tag: "Sekali sahaja",
    name: "Butiran & bengkel anda",
    lines: ["Isi sekali sahaja, di halaman utama.", "Kami simpan untuk akaun anda.", "Kes tidak boleh dimulakan selagi belum lengkap.", "Anda boleh ubah bila-bila masa."],
    fields: ["Log masuk Merimen", "Pengurus", "Penyelaras", "Bengkel 1–3"],
    locked: "Pilih satu bengkel pada setiap kes. Ia tidak boleh ditukar selepas Langkah 3 (Merimen) bermula.",
  },
  steps: [
    { tag: "Langkah 1", name: "Dokumen", lines: ["Tekan Kes baharu dan pilih fail, atau seret fail ke halaman utama.", "Ia terus dimuat naik.", "Satu zip, atau PDF dan gambar.", "Kami baca dokumen itu untuk anda."] },
    { tag: "Langkah 2", name: "Namakan gambar", lines: ["Kami cadangkan nama bahagian untuk setiap gambar kerosakan.", "Semak nama. Betulkan yang salah.", "Kemudian tekan Selesai."] },
    { tag: "Langkah 3", name: "Merimen", lines: ["Kami log masuk ke akaun Merimen anda sendiri.", "Tuntutan dimasukkan untuk anda.", "Anda tidak perlu buat apa-apa.", "Langkah ini ditanda hanya apabila kes siap."] },
    { tag: "Langkah 4", name: "Siap", lines: ["Kes sudah siap.", "Buka untuk lihat hasilnya."] },
  ],
  zip: { name: "Zip yang ada beberapa kereta", lines: ["Setiap folder kereta jadi satu kes.", "Setiap kereta dikira satu kes.", "Muat naik zip itu sahaja, tanpa fail lain.", "Semak kereta, kemudian tekan Muat naik."] },
  missing: { name: "Ada dokumen yang tiada?", lines: ["Kes berhenti dan menyebut dokumen yang kurang.", "Tambah di halaman kes.", "Kes anda yang lain diteruskan seperti biasa."] },
  list: {
    name: "Semua kes, satu halaman",
    lines: ["Satu baris setiap kes, dengan bar langkah sendiri.", "Tekan baris untuk buka butiran di situ juga.", "Kes yang menunggu tindakan anda disenaraikan paling atas.", "Guna carian untuk cari kes."],
    legend: { go: "Siap", wait: "Menunggu anda", fail: "Gagal", later: "Belum lagi" },
  },
  credits: { name: "Kredit", lines: ["Setiap kes menggunakan 1,000 kredit.", "Baki anda ada di Bil.", "Beli lagi bila-bila masa."], unit: "1 kes = 1,000 kredit" },
  remove: { name: "Padam kes", lines: ["Kes keluar dari senarai anda.", "Tiada apa dihantar ke Merimen.", "Kredit dipulangkan hanya jika dokumen belum dibaca.", "Failnya dipadam selepas 7 hari.", "Tidak boleh dipadam selepas kes masuk Merimen."] },
  draw: { days: "7 hari", drop: "Lepaskan fail di sini", doneBtn: "Selesai", signIn: "Log masuk", parts: "Senarai bahagian", upload: "Gambar", finished: "Siap", checkNames: "Semak nama" },
  cta: { start: "Mulakan kes", cases: "Kembali ke kes saya" },
};

export const GUIDE: Record<Lang, GuideCopy> = { en, zh, ms };
