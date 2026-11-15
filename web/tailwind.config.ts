import type { Config } from "tailwindcss";

const cjk = ['"PingFang SC"', '"Noto Sans SC"', '"Microsoft YaHei"'];

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Values live in globals.css as CSS variables: dark "Night Bay" by default (landing), light "Day Bay" for the working pages.
        // "Night Bay": an inspection bay at night. One cold light (ice) does the looking,
        // amber marks what is damaged or needs attention, green only ever means done.
        bay: "rgb(var(--c-bay) / <alpha-value>)", // the room — page
        panel: "rgb(var(--c-panel) / <alpha-value>)", // raised surface — cards, inputs, menus
        panel2: "rgb(var(--c-panel2) / <alpha-value>)", // second level — hover, wells
        hair: "rgb(var(--c-hair) / <alpha-value>)", // hairline
        hairsoft: "rgb(var(--c-hairsoft) / <alpha-value>)", // faint grid
        fg: "rgb(var(--c-fg) / <alpha-value>)", // text
        mute: "rgb(var(--c-mute) / <alpha-value>)", // secondary text (6.4:1 on bay)
        ice: "rgb(var(--c-ice) / <alpha-value>)", // scan light — primary buttons, links, focus
        icetint: "rgb(var(--c-icetint) / <alpha-value>)", // quiet ice fill
        amber: "rgb(var(--c-amber) / <alpha-value>)", // damaged / needs attention / being keyed / error
        ambertint: "rgb(var(--c-ambertint) / <alpha-value>)",
        go: "rgb(var(--c-go) / <alpha-value>)", // done
        gotint: "rgb(var(--c-gotint) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", ...cjk, "system-ui", "sans-serif"],
        // the wordmark's own typeface, for the landing page's big lettering
        brand: ["var(--font-brand)", ...cjk, "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", ...cjk, "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", ...cjk, "ui-monospace", "monospace"],
      },
      maxWidth: { sheet: "1320px" },
    },
  },
  plugins: [],
} satisfies Config;
