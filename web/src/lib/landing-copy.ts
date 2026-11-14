import type { Lang } from "./i18n";

/** Words of the scroll journey on the landing page. Four stops, one word and one line each. */
export type JourneyCopy = {
  h1: [string, string];
  sub: string;
  scroll: string;
  skip: string;
  steps: { word: string; line: string }[];
};

export const JOURNEY: Record<Lang, JourneyCopy> = {
  en: {
    h1: ["Claims on", "autopilot."],
    sub: "For Malaysian motor claim adjusters.",
    scroll: "Scroll",
    skip: "Skip the animation",
    steps: [
      { word: "Upload", line: "Drop in the case file." },
      { word: "Scan", line: "Every document read. Every photo named." },
      { word: "Autopilot", line: "The case keys itself into your Merimen." },
      { word: "Done", line: "About 5 minutes. By hand, 15 to 20." },
    ],
  },
  zh: {
    h1: ["理赔录入，", "自动完成。"],
    sub: "为马来西亚车险理算师而做。",
    scroll: "往下滚动",
    skip: "跳过动画",
    steps: [
      { word: "上传", line: "把案件资料放进来。" },
      { word: "扫描", line: "每份文件读完，每张照片命名。" },
      { word: "自动录入", line: "案件自动录入你的 Merimen。" },
      { word: "完成", line: "约 5 分钟。人手要 15 到 20 分钟。" },
    ],
  },
  ms: {
    h1: ["Tuntutan secara", "autopilot."],
    sub: "Untuk adjuster tuntutan motor di Malaysia.",
    scroll: "Tatal",
    skip: "Langkau animasi",
    steps: [
      { word: "Muat naik", line: "Masukkan fail kes." },
      { word: "Imbas", line: "Setiap dokumen dibaca. Setiap foto dinamakan." },
      { word: "Autopilot", line: "Kes dimasukkan sendiri ke Merimen anda." },
      { word: "Selesai", line: "Kira-kira 5 minit. Secara manual, 15 hingga 20." },
    ],
  },
};
