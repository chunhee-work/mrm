import { test } from "node:test";
import assert from "node:assert/strict";
import { honestCopy, honestString } from "./honest-copy";
import { HOME } from "./home-copy";
import { PRIVACY, TERMS } from "./legal";
import { DICTS, type Lang } from "./i18n";

const LANGS: Lang[] = ["en", "zh", "ms"];
const CLAIM = /never (ask|see|receive)|不会(索取|收到)|看不到你的密码|tidak pernah (menerima|meminta|melihat)/i;
const flat = (v: unknown): string[] => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(flat) : v && typeof v === "object" ? Object.values(v).flatMap(flat) : [];

test("B04 flag off: copy is untouched", () => {
  assert.equal(honestCopy(HOME.en, "en", false), HOME.en);
  assert.equal(honestString("We never ask for your Merimen password.", "en", false), "We never ask for your Merimen password.");
});

test("B04 flag on: no page, in any language, still says we never see/ask for the Merimen password", () => {
  for (const lang of LANGS) {
    for (const doc of [HOME[lang], PRIVACY[lang], TERMS[lang]]) {
      const out = flat(honestCopy(doc, lang, true)).filter((s) => /merimen/i.test(s) && CLAIM.test(s));
      assert.deepEqual(out, [], `${lang}: ${out[0]}`);
    }
    for (const k of ["conn.intro", "meta.d.security"]) {
      const s = honestString((DICTS[lang] as Record<string, string>)[k], lang, true);
      assert.ok(!CLAIM.test(s), `${lang} ${k}`);
    }
  }
});

test("B04 flag on: the replacement says the password is stored encrypted, in the page language", () => {
  assert.match(honestString("You sign in to Merimen yourself. We never ask for your Merimen password.", "en", true), /encrypted/);
  assert.match(honestString("由你本人登录 Merimen，我们不会索取你的 Merimen 密码。", "zh", true), /加密/);
  assert.match(honestString("Anda sendiri yang log masuk ke Merimen. Kami tidak pernah meminta kata laluan Merimen anda.", "ms", true), /tersulit/);
});

test("B04 flag on: the FAQ answer to 'Do you need my Merimen password?' is no longer a flat No", () => {
  for (const lang of LANGS) {
    const faq = flat(honestCopy(HOME[lang].faq, lang, true)).join(" ");
    assert.ok(!/^(No|不需要|Tidak)\b/.test(faq));
  }
  const en = JSON.stringify(honestCopy(HOME.en.faq, "en", true));
  assert.match(en, /stored encrypted/);
});

test("R2-B13 both switches off: the FAQ no longer promises a secure browser window that does not exist; other copy is untouched", () => {
  for (const lang of LANGS) {
    const before = flat(HOME[lang].faq).join(" ");
    assert.match(before, /secure browser window|安全的浏览器窗口|tetingkap pelayar yang selamat/);
    const out = honestCopy(HOME[lang], lang, false, true);
    const faq = flat(out.faq).join(" ");
    assert.ok(!/secure browser window|安全的浏览器窗口|tetingkap pelayar yang selamat/i.test(faq), lang);
    assert.deepEqual(out.faq.items.filter((x) => !/Merimen/.test(x.q)), HOME[lang].faq.items.filter((x) => !/Merimen/.test(x.q)));
  }
  assert.equal(honestCopy(HOME.en, "en", false, false), HOME.en);
});
