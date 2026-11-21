import type { Lang } from "./i18n";

// B04. Several pages promise "we never see / never ask for / never store your Merimen password". That is true for the
// in-browser window, but NOT when the saved-login worker is on (WORKER_UI=on): then the password is stored, encrypted,
// and used by our worker. While that flag is on, every such sentence is swapped for a truthful one (same place, same tone).
// Matching is by phrase, in any language; the replacement is chosen by the page language.

const SAVED: Record<Lang, string> = {
  en: "If you turn on the saved login, your Merimen user name and password are stored encrypted and used only by our worker to sign in for you, once. We never show them again, and you can remove them at any time on the Connection page.",
  zh: "如果你开启「保存登录」，你的 Merimen 用户名和密码会加密保存，只用于我们的后台替你登录一次。我们不会再显示它们，你可以随时在「连接」页删除。",
  ms: "Jika anda hidupkan log masuk tersimpan, nama pengguna dan kata laluan Merimen anda disimpan secara tersulit dan hanya digunakan oleh worker kami untuk log masuk untuk anda, sekali. Kami tidak memaparkannya semula, dan anda boleh memadamnya bila-bila masa di halaman Sambungan.",
};
const SHORT: Record<Lang, string> = {
  en: "Your Merimen password is stored encrypted and used only to sign in for you.",
  zh: "你的 Merimen 密码会加密保存，只用于替你登录。",
  ms: "Kata laluan Merimen anda disimpan secara tersulit dan hanya digunakan untuk log masuk untuk anda.",
};
const FAQ: Record<Lang, string> = {
  en: "Only if you choose the saved login. You enter it once; it is stored encrypted and used only by our worker to sign in. You can delete it any time.",
  zh: "只有你选择「保存登录」时才需要。你填写一次，加密保存，只用于我们的后台登录。你可以随时删除。",
  ms: "Hanya jika anda memilih log masuk tersimpan. Anda memasukkannya sekali; ia disimpan secara tersulit dan hanya digunakan oleh worker kami. Anda boleh memadamnya bila-bila masa.",
};

// R2-B13: with the saved-login worker off AND the secure browser window off, "you log in yourself in a secure browser window"
// describes something that does not exist. Until one of them is on, the FAQ answer says plainly that it is coming.
const SOON: Record<Lang, string> = {
  en: "Not right now: we do not ask for it. Connecting to Merimen from inside the app is coming soon.",
  zh: "目前不需要：我们不会向你索取。在应用里连接 Merimen 的功能即将推出。",
  ms: "Buat masa ini tidak: kami tidak memintanya. Sambungan ke Merimen dari dalam aplikasi akan datang tidak lama lagi.",
};

/** [phrase that makes a string a "no password" claim, what replaces it]. */
const RULES: [RegExp, Record<Lang, string>][] = [
  [/never (ask for|receive|see|store)|never ask|never see|not store/i, SAVED],
  [/不会(索取|收到|保存)|看不到你的密码/, SAVED],
  [/tidak (pernah|meminta|menyimpan)/i, SAVED],
];
const FAQ_RULE = /Do you need my Merimen password|需要我的 Merimen 密码|perlukan kata laluan Merimen/;

const isPwClaim = (s: string) => /password|密码|kata laluan/i.test(s) && /merimen|你的|anda|your/i.test(s) && RULES.some(([re]) => re.test(s));

/** One string: swapped when it is a "no Merimen password" claim and `worker` is on. Everything else is returned as it is. */
export function honestString(s: string, lang: Lang, worker: boolean, shortForm = false): string {
  if (!worker || !isPwClaim(s)) return s;
  return shortForm || s.length < 70 ? SHORT[lang] : SAVED[lang];
}

/** Deep version for page copy (arrays/objects of strings). FAQ pairs {q, a}: the answer is rewritten as a whole. */
export function honestCopy<T>(data: T, lang: Lang, worker: boolean, soon = false): T {
  if (!worker && !soon) return data;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return worker ? honestString(v, lang, true) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.q === "string" && FAQ_RULE.test(o.q)) return { ...o, a: worker ? FAQ[lang] : SOON[lang] };
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(data) as T;
}
