import type { Lang } from "./i18n";

// Legal text shown on /privacy and /terms.
// DRAFT prepared for the owner's (and a lawyer's) review. Tokens in braces are filled from SITE at render time:
// {brand} {operator} {email}
// PDPA s.7(3): the notice must be available in Bahasa Malaysia and English. Chinese is provided for convenience.

export type LegalSection = { h: string; p?: string[]; ul?: string[] };
export type LegalDoc = { title: string; updated: string; note: string; intro: string[]; sections: LegalSection[] };

export const LEGAL_UPDATED = "2026-11-14";

const privacyEn: LegalDoc = {
  title: "Privacy Notice",
  updated: "Last updated",
  note: "This notice is issued in English and Bahasa Malaysia. If the versions differ, the English version applies.",
  intro: [
    "This notice explains how {operator} (“{brand}”, “we”) handles personal data under Malaysia’s Personal Data Protection Act 2010 (PDPA).",
  ],
  sections: [
    {
      h: "Two kinds of data",
      ul: [
        "Account data: details about you and your company. We decide how it is used, so we are the data controller.",
        "Case data: the files and photos you upload for a claim. Your firm decides how it is used and we handle it only on your instructions, so we are your data processor.",
      ],
    },
    {
      h: "What we collect",
      ul: [
        "Account: company name, your name, work email, your password (stored only as a one-way hash), language choice, and sign-in and activity records.",
        "Case data: registration cards, insurance policies, police reports, names, identity card numbers, addresses, phone numbers, vehicle details, vehicle photos, and the claim details keyed into Merimen.",
        "Merimen connection: you sign in to Merimen yourself. We never receive your Merimen password. The session that lets us work in your account is kept encrypted and only while the connection is active.",
        "Cookies: only the ones needed to keep you signed in and remember your language. No advertising or tracking cookies.",
      ],
    },
    {
      h: "Why we use it",
      ul: [
        "To open and protect your account.",
        "To read your case files and key each case into your own Merimen account.",
        "To show you the status of your cases and send service emails such as verification and password reset.",
        "To bill you, fix problems, prevent misuse and meet our legal duties.",
      ],
      p: ["We do not sell personal data and we do not use case data for marketing."],
    },
    {
      h: "Must you provide it?",
      p: [
        "Company name, email and password are needed to open an account; without them we cannot provide the service. Case data is supplied by you, case by case, when you choose to submit a claim.",
      ],
    },
    {
      h: "Who receives it",
      ul: [
        "Service providers that run {brand} for us: cloud hosting and file storage, database, email delivery, AI services that read documents and photos, and the cloud browser used to work inside your Merimen account. They may use the data only to provide their service to us.",
        "Merimen, when we key a case into your account on your instruction.",
        "Regulators, courts or enforcement agencies, when the law requires it.",
      ],
    },
    {
      h: "Where it is stored",
      p: [
        "Our database is hosted in Singapore. Some of our service providers process data in Singapore and the United States. When personal data leaves Malaysia we rely on the grounds allowed by section 129 of the PDPA, including contracts that require the recipient to protect it.",
      ],
    },
    {
      h: "How long we keep it",
      ul: [
        "Account data: while your account is open, and afterwards only as long as the law requires.",
        "Case data: only as long as needed to complete the case and to support you afterwards. You can ask us to delete a case’s files at any time. We delete all case files when you close your account.",
      ],
    },
    {
      h: "How we protect it",
      ul: [
        "Encrypted connections between your browser and {brand}.",
        "Private file storage, separated company by company.",
        "Access limited to the people and systems that need it, with a record of key actions.",
      ],
      p: ["If a breach affects your data, we will notify you and the Personal Data Protection Commissioner as the PDPA requires."],
    },
    {
      h: "Your rights",
      p: [
        "You may ask to see or correct your personal data, withdraw consent, limit how we use it, receive a copy where this is technically feasible, or close your account. Write to {email}.",
        "If your personal data appears in a claim file, please contact the adjusting firm handling your claim. We will help that firm respond to you.",
      ],
    },
    {
      h: "If you are an adjusting firm",
      p: [
        "You confirm that you are entitled to give us the case data you upload and that the people concerned have been told how their data is used for the claim.",
      ],
    },
    {
      h: "Contact and complaints",
      p: ["Questions, requests and complaints about personal data: {email}. We will tell you if this notice changes in a way that matters."],
    },
  ],
};

const privacyMs: LegalDoc = {
  title: "Notis Privasi",
  updated: "Kemas kini terakhir",
  note: "Notis ini dikeluarkan dalam Bahasa Malaysia dan Bahasa Inggeris. Jika terdapat percanggahan, versi Bahasa Inggeris terpakai.",
  intro: [
    "Notis ini menerangkan cara {operator} (“{brand}”, “kami”) mengendalikan data peribadi di bawah Akta Perlindungan Data Peribadi 2010 (PDPA) Malaysia.",
  ],
  sections: [
    {
      h: "Dua jenis data",
      ul: [
        "Data akaun: maklumat tentang anda dan syarikat anda. Kami menentukan penggunaannya, maka kami ialah pengawal data.",
        "Data kes: fail dan gambar yang anda muat naik untuk sesuatu tuntutan. Firma anda menentukan penggunaannya dan kami mengendalikannya hanya atas arahan anda, maka kami ialah pemproses data anda.",
      ],
    },
    {
      h: "Apa yang kami kumpul",
      ul: [
        "Akaun: nama syarikat, nama anda, e-mel kerja, kata laluan anda (disimpan sebagai cincangan sehala sahaja), pilihan bahasa, serta rekod log masuk dan aktiviti.",
        "Data kes: kad pendaftaran kenderaan, polisi insurans, laporan polis, nama, nombor kad pengenalan, alamat, nombor telefon, butiran kenderaan, gambar kenderaan dan butiran tuntutan yang dimasukkan ke dalam Merimen.",
        "Sambungan Merimen: anda sendiri yang log masuk ke Merimen. Kami tidak pernah menerima kata laluan Merimen anda. Sesi yang membolehkan kami bekerja dalam akaun anda disimpan secara tersulit dan hanya semasa sambungan aktif.",
        "Kuki: hanya yang perlu untuk mengekalkan log masuk dan mengingati bahasa anda. Tiada kuki pengiklanan atau penjejakan.",
      ],
    },
    {
      h: "Tujuan penggunaan",
      ul: [
        "Untuk membuka dan melindungi akaun anda.",
        "Untuk membaca fail kes anda dan memasukkan setiap kes ke dalam akaun Merimen anda sendiri.",
        "Untuk memaparkan status kes anda dan menghantar e-mel perkhidmatan seperti pengesahan dan tetapan semula kata laluan.",
        "Untuk pengebilan, membaiki masalah, mencegah penyalahgunaan dan memenuhi kewajipan undang-undang kami.",
      ],
      p: ["Kami tidak menjual data peribadi dan tidak menggunakan data kes untuk pemasaran."],
    },
    {
      h: "Adakah wajib diberikan?",
      p: [
        "Nama syarikat, e-mel dan kata laluan diperlukan untuk membuka akaun; tanpanya kami tidak dapat menyediakan perkhidmatan. Data kes dibekalkan oleh anda, kes demi kes, apabila anda memilih untuk menghantar tuntutan.",
      ],
    },
    {
      h: "Siapa yang menerimanya",
      ul: [
        "Pembekal perkhidmatan yang mengendalikan {brand} bagi pihak kami: pengehosan awan dan storan fail, pangkalan data, penghantaran e-mel, perkhidmatan AI yang membaca dokumen dan gambar, serta pelayar awan yang digunakan untuk bekerja dalam akaun Merimen anda. Mereka hanya boleh menggunakan data itu untuk memberikan perkhidmatan kepada kami.",
        "Merimen, apabila kami memasukkan kes ke dalam akaun anda atas arahan anda.",
        "Pengawal selia, mahkamah atau agensi penguatkuasaan, apabila dikehendaki oleh undang-undang.",
      ],
    },
    {
      h: "Tempat data disimpan",
      p: [
        "Pangkalan data kami dihoskan di Singapura. Sesetengah pembekal perkhidmatan kami memproses data di Singapura dan Amerika Syarikat. Apabila data peribadi dipindahkan ke luar Malaysia, kami bergantung pada alasan yang dibenarkan oleh seksyen 129 PDPA, termasuk kontrak yang mewajibkan penerima melindunginya.",
      ],
    },
    {
      h: "Tempoh simpanan",
      ul: [
        "Data akaun: selagi akaun anda dibuka, dan selepas itu hanya selama yang dikehendaki oleh undang-undang.",
        "Data kes: hanya selama yang perlu untuk menyiapkan kes dan menyokong anda selepas itu. Anda boleh meminta kami memadamkan fail sesuatu kes pada bila-bila masa. Kami memadamkan semua fail kes apabila anda menutup akaun.",
      ],
    },
    {
      h: "Cara kami melindunginya",
      ul: [
        "Sambungan tersulit antara pelayar anda dan {brand}.",
        "Storan fail peribadi, diasingkan mengikut syarikat.",
        "Akses terhad kepada orang dan sistem yang memerlukannya, dengan rekod tindakan utama.",
      ],
      p: ["Jika pelanggaran data menjejaskan data anda, kami akan memaklumkan anda dan Pesuruhjaya Perlindungan Data Peribadi seperti yang dikehendaki oleh PDPA."],
    },
    {
      h: "Hak anda",
      p: [
        "Anda boleh meminta untuk melihat atau membetulkan data peribadi anda, menarik balik persetujuan, mengehadkan penggunaannya, menerima salinan jika boleh dilaksanakan secara teknikal, atau menutup akaun anda. Tulis kepada {email}.",
        "Jika data peribadi anda terdapat dalam fail tuntutan, sila hubungi firma penyelaras yang mengendalikan tuntutan anda. Kami akan membantu firma itu memberi maklum balas kepada anda.",
      ],
    },
    {
      h: "Jika anda firma penyelaras",
      p: [
        "Anda mengesahkan bahawa anda berhak memberikan data kes yang anda muat naik kepada kami dan bahawa orang yang berkenaan telah dimaklumkan tentang cara data mereka digunakan untuk tuntutan itu.",
      ],
    },
    {
      h: "Hubungi kami dan aduan",
      p: ["Pertanyaan, permintaan dan aduan tentang data peribadi: {email}. Kami akan memaklumkan anda jika notis ini berubah secara ketara."],
    },
  ],
};

const privacyZh: LegalDoc = {
  title: "隐私声明",
  updated: "最后更新",
  note: "本声明以英文和马来文发布，中文版仅供参考。如有出入，以英文版为准。",
  intro: ["本声明说明 {operator}（“{brand}”、“我们”）如何依照马来西亚《2010 年个人资料保护法令》（PDPA）处理个人资料。"],
  sections: [
    {
      h: "两类资料",
      ul: [
        "账号资料：关于你和你公司的信息。用途由我们决定，所以我们是资料控制者。",
        "案件资料：你为理赔案件上传的文件和照片。用途由你的公司决定，我们只按你的指示处理，所以我们是你的资料处理者。",
      ],
    },
    {
      h: "我们收集什么",
      ul: [
        "账号：公司名称、你的姓名、工作邮箱、密码（只保存单向哈希）、语言选择、登录和操作记录。",
        "案件资料：车辆注册卡、保单、报案纸、姓名、身份证号码、地址、电话、车辆资料、车辆照片，以及录入 Merimen 的理赔内容。",
        "Merimen 连接：由你本人登录 Merimen，我们不会收到你的 Merimen 密码。让我们在你账号里操作的会话信息以加密方式保存，而且只在连接有效期间保留。",
        "Cookie：只用保持登录和记住语言所必需的。没有广告或追踪 Cookie。",
      ],
    },
    {
      h: "用途",
      ul: [
        "开通并保护你的账号。",
        "读取你的案件资料，把每个案件录入你自己的 Merimen 账号。",
        "显示案件进度，发送验证、重设密码等服务邮件。",
        "收费、排查问题、防止滥用，以及履行法律义务。",
      ],
      p: ["我们不出售个人资料，也不把案件资料用于营销。"],
    },
    {
      h: "是否必须提供",
      p: ["开通账号需要公司名称、邮箱和密码，缺少这些我们无法提供服务。案件资料由你在提交每个案件时自行提供。"],
    },
    {
      h: "谁会收到资料",
      ul: [
        "为我们运行 {brand} 的服务商：云端托管和文件存储、数据库、邮件发送、读取文件和照片的 AI 服务，以及用来在你的 Merimen 账号里操作的云端浏览器。他们只能为向我们提供服务而使用这些资料。",
        "Merimen：当我们按你的指示把案件录入你的账号时。",
        "法律要求时的监管机构、法院或执法机构。",
      ],
    },
    {
      h: "存放地点",
      p: ["我们的数据库托管在新加坡。部分服务商在新加坡和美国处理资料。个人资料转移到马来西亚境外时，我们依据 PDPA 第 129 条允许的理由进行，包括要求接收方保护资料的合约。"],
    },
    {
      h: "保存多久",
      ul: [
        "账号资料：账号存续期间保存，之后只按法律要求的期限保留。",
        "案件资料：只保存到完成案件和后续支持所需的时间。你可以随时要求我们删除某个案件的文件。你关闭账号时，我们会删除全部案件文件。",
      ],
    },
    {
      h: "如何保护",
      ul: ["浏览器和 {brand} 之间使用加密连接。", "文件私有存储，按公司隔离。", "只有必要的人员和系统可以访问，关键操作有记录。"],
      p: ["如果资料外泄影响到你的资料，我们会按 PDPA 的要求通知你和个人资料保护专员。"],
    },
    {
      h: "你的权利",
      p: [
        "你可以要求查看或更正你的个人资料、撤回同意、限制使用、在技术可行时取得副本，或关闭账号。请写信到 {email}。",
        "如果你的个人资料出现在理赔文件里，请联系处理你案件的理算公司，我们会协助该公司回复你。",
      ],
    },
    {
      h: "如果你是理算公司",
      p: ["你确认自己有权把上传的案件资料交给我们，并且相关人士已被告知其资料会用于该理赔。"],
    },
    {
      h: "联系与投诉",
      p: ["有关个人资料的问题、请求和投诉：{email}。本声明如有重要变更，我们会通知你。"],
    },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of Service",
  updated: "Last updated",
  note: "These terms are provided in English, Bahasa Malaysia and Chinese. If the versions differ, the English version applies.",
  intro: ["These terms apply between {operator} (“{brand}”, “we”) and the company that opens an account (“you”). By creating an account you accept them."],
  sections: [
    {
      h: "The service",
      p: [
        "{brand} reads the case files you upload and keys the motor claim into your own Merimen account. {brand} is an independent service. It is not affiliated with, endorsed by or operated by Merimen or any insurer.",
      ],
    },
    {
      h: "Your account",
      ul: [
        "Give accurate company details and keep your password private.",
        "You are responsible for what your staff do with your account.",
        "The person who signs up confirms they are authorised to act for the company.",
      ],
    },
    {
      h: "Your Merimen account",
      ul: [
        "You sign in to Merimen yourself. We never ask for your Merimen password.",
        "You authorise us to work inside that session only to key the cases you submit.",
        "You confirm that you are allowed to use an assistant like {brand} with your Merimen account.",
        "You can disconnect Merimen at any time.",
      ],
    },
    {
      h: "Your case data",
      p: [
        "The case data stays yours. You confirm you are entitled to upload it. We handle it as set out in the Privacy Notice and only to provide the service.",
      ],
    },
    {
      h: "Check every case",
      p: [
        "{brand} prepares the entries; you remain the adjuster. Review each case in Merimen before you submit or approve it. Professional judgment and the final report are your responsibility.",
      ],
    },
    {
      h: "Fees",
      p: ["Fees are the ones agreed with you before you use the paid service. Taxes are added where the law requires."],
    },
    {
      h: "Fair use",
      ul: [
        "Use {brand} only for lawful claims work.",
        "Do not try to reach another company’s data.",
        "Do not copy, resell, overload or interfere with the service.",
      ],
    },
    {
      h: "Availability",
      p: [
        "We work to keep {brand} available, but it depends on Merimen and other third-party services, and it may be paused for maintenance. If a case cannot be completed, we will tell you why.",
      ],
    },
    {
      h: "Liability",
      p: [
        "To the extent the law allows, {brand} is provided as it is, we are not liable for indirect or consequential loss, and our total liability for any claim is limited to the fees you paid us in the three months before it arose. Nothing here limits liability that cannot be limited under Malaysian law.",
      ],
    },
    {
      h: "Ending the service",
      p: [
        "You may close your account at any time. We may suspend or close an account that breaks these terms or puts the service or other customers at risk.",
      ],
    },
    {
      h: "Changes",
      p: ["We may update these terms. We will notify you of important changes before they take effect."],
    },
    {
      h: "Governing law",
      p: ["These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction."],
    },
    { h: "Contact", p: ["{email}"] },
  ],
};

const termsMs: LegalDoc = {
  title: "Terma Perkhidmatan",
  updated: "Kemas kini terakhir",
  note: "Terma ini disediakan dalam Bahasa Inggeris, Bahasa Malaysia dan Bahasa Cina. Jika terdapat percanggahan, versi Bahasa Inggeris terpakai.",
  intro: ["Terma ini terpakai antara {operator} (“{brand}”, “kami”) dan syarikat yang membuka akaun (“anda”). Dengan mencipta akaun, anda menerimanya."],
  sections: [
    {
      h: "Perkhidmatan",
      p: [
        "{brand} membaca fail kes yang anda muat naik dan memasukkan tuntutan motor ke dalam akaun Merimen anda sendiri. {brand} ialah perkhidmatan bebas. Ia tidak bergabung dengan, tidak disokong oleh dan tidak dikendalikan oleh Merimen atau mana-mana syarikat insurans.",
      ],
    },
    {
      h: "Akaun anda",
      ul: [
        "Berikan butiran syarikat yang tepat dan rahsiakan kata laluan anda.",
        "Anda bertanggungjawab atas penggunaan akaun oleh kakitangan anda.",
        "Orang yang mendaftar mengesahkan bahawa dia diberi kuasa untuk bertindak bagi pihak syarikat.",
      ],
    },
    {
      h: "Akaun Merimen anda",
      ul: [
        "Anda sendiri yang log masuk ke Merimen. Kami tidak pernah meminta kata laluan Merimen anda.",
        "Anda memberi kuasa kepada kami untuk bekerja dalam sesi itu hanya bagi memasukkan kes yang anda hantar.",
        "Anda mengesahkan bahawa anda dibenarkan menggunakan pembantu seperti {brand} dengan akaun Merimen anda.",
        "Anda boleh memutuskan sambungan Merimen pada bila-bila masa.",
      ],
    },
    {
      h: "Data kes anda",
      p: [
        "Data kes kekal milik anda. Anda mengesahkan bahawa anda berhak memuat naiknya. Kami mengendalikannya seperti yang dinyatakan dalam Notis Privasi dan hanya untuk menyediakan perkhidmatan.",
      ],
    },
    {
      h: "Semak setiap kes",
      p: [
        "{brand} menyediakan entri; anda kekal sebagai penyelaras. Semak setiap kes dalam Merimen sebelum anda menghantar atau meluluskannya. Pertimbangan profesional dan laporan akhir ialah tanggungjawab anda.",
      ],
    },
    {
      h: "Bayaran",
      p: ["Bayaran adalah seperti yang dipersetujui dengan anda sebelum anda menggunakan perkhidmatan berbayar. Cukai ditambah jika dikehendaki oleh undang-undang."],
    },
    {
      h: "Penggunaan wajar",
      ul: [
        "Gunakan {brand} hanya untuk kerja tuntutan yang sah.",
        "Jangan cuba mencapai data syarikat lain.",
        "Jangan menyalin, menjual semula, membebankan atau mengganggu perkhidmatan.",
      ],
    },
    {
      h: "Ketersediaan",
      p: [
        "Kami berusaha memastikan {brand} tersedia, tetapi ia bergantung pada Merimen dan perkhidmatan pihak ketiga lain, dan mungkin dihentikan seketika untuk penyelenggaraan. Jika sesuatu kes tidak dapat disiapkan, kami akan memaklumkan sebabnya.",
      ],
    },
    {
      h: "Liabiliti",
      p: [
        "Setakat yang dibenarkan oleh undang-undang, {brand} disediakan seadanya, kami tidak bertanggungjawab atas kerugian tidak langsung atau berbangkit, dan jumlah liabiliti kami bagi sebarang tuntutan terhad kepada bayaran yang anda bayar kepada kami dalam tempoh tiga bulan sebelum tuntutan itu timbul. Tiada apa-apa di sini mengehadkan liabiliti yang tidak boleh dihadkan di bawah undang-undang Malaysia.",
      ],
    },
    {
      h: "Menamatkan perkhidmatan",
      p: [
        "Anda boleh menutup akaun pada bila-bila masa. Kami boleh menggantung atau menutup akaun yang melanggar terma ini atau membahayakan perkhidmatan atau pelanggan lain.",
      ],
    },
    {
      h: "Perubahan",
      p: ["Kami boleh mengemas kini terma ini. Kami akan memaklumkan perubahan penting sebelum ia berkuat kuasa."],
    },
    {
      h: "Undang-undang yang mentadbir",
      p: ["Terma ini ditadbir oleh undang-undang Malaysia, dan mahkamah Malaysia mempunyai bidang kuasa."],
    },
    { h: "Hubungi kami", p: ["{email}"] },
  ],
};

const termsZh: LegalDoc = {
  title: "服务条款",
  updated: "最后更新",
  note: "本条款提供英文、马来文和中文版本。如有出入，以英文版为准。",
  intro: ["本条款适用于 {operator}（“{brand}”、“我们”）与开通账号的公司（“你”）之间。创建账号即表示你接受本条款。"],
  sections: [
    {
      h: "服务内容",
      p: ["{brand} 读取你上传的案件资料，并把车险理赔案件录入你自己的 Merimen 账号。{brand} 是独立服务，与 Merimen 或任何保险公司没有隶属、背书或运营关系。"],
    },
    {
      h: "你的账号",
      ul: ["提供准确的公司资料，并妥善保管密码。", "你的员工使用账号所做的事由你负责。", "注册人确认自己有权代表公司。"],
    },
    {
      h: "你的 Merimen 账号",
      ul: [
        "由你本人登录 Merimen，我们不会索取你的 Merimen 密码。",
        "你授权我们只为录入你提交的案件而在该会话里操作。",
        "你确认自己可以在 Merimen 账号上使用 {brand} 这类辅助工具。",
        "你可以随时断开 Merimen 连接。",
      ],
    },
    {
      h: "你的案件资料",
      p: ["案件资料始终属于你。你确认自己有权上传。我们按《隐私声明》处理，并且只用于提供服务。"],
    },
    {
      h: "每个案件都要核对",
      p: ["{brand} 负责准备录入内容，你仍然是理算师。提交或批准前，请在 Merimen 里核对每个案件。专业判断和最终报告由你负责。"],
    },
    {
      h: "费用",
      p: ["费用以你使用付费服务前与我们约定的为准。法律要求时另加税费。"],
    },
    {
      h: "合理使用",
      ul: ["只把 {brand} 用于合法的理赔工作。", "不得尝试访问其他公司的资料。", "不得复制、转售、过度占用或干扰服务。"],
    },
    {
      h: "可用性",
      p: ["我们尽力保持 {brand} 可用，但服务依赖 Merimen 和其他第三方服务，也可能因维护而暂停。如果某个案件无法完成，我们会告诉你原因。"],
    },
    {
      h: "责任",
      p: ["在法律允许的范围内，{brand} 按现状提供；我们不对间接或衍生损失负责；对任何索赔的总责任以索赔发生前三个月内你向我们支付的费用为限。本条款不限制依马来西亚法律不可限制的责任。"],
    },
    {
      h: "终止服务",
      p: ["你可以随时关闭账号。对违反本条款，或危及服务或其他客户的账号，我们可以暂停或关闭。"],
    },
    { h: "变更", p: ["我们可能更新本条款。重要变更会在生效前通知你。"] },
    { h: "适用法律", p: ["本条款受马来西亚法律管辖，由马来西亚法院审理。"] },
    { h: "联系", p: ["{email}"] },
  ],
};

export const PRIVACY: Record<Lang, LegalDoc> = { en: privacyEn, ms: privacyMs, zh: privacyZh };
export const TERMS: Record<Lang, LegalDoc> = { en: termsEn, ms: termsMs, zh: termsZh };

export function fillLegal(s: string, v: { brand: string; operator: string; email: string }): string {
  return s.replaceAll("{brand}", v.brand).replaceAll("{operator}", v.operator).replaceAll("{email}", v.email);
}
