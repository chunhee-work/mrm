import type { Config } from "tailwindcss";

const cjk = ['"PingFang SC"', '"Noto Sans SC"', '"Microsoft YaHei"'];

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Night Bay": an inspection bay at night. One cold light (ice) does the looking,
        // amber marks what is damaged or needs attention, green only ever means done.
        bay: "#07090C", // the room — page
        panel: "#0E1217", // raised surface — cards, inputs, menus
        panel2: "#151A21", // second level — hover, wells
        hair: "#222933", // hairline
        hairsoft: "#171C24", // faint grid
        fg: "#EEF2F6", // text
        mute: "#8A94A3", // secondary text (6.4:1 on bay)
        ice: "#BFE9FF", // scan light — primary buttons, links, focus
        icetint: "#0F1A22", // quiet ice fill
        amber: "#FFB020", // damaged / needs attention / being keyed / error
        ambertint: "#2A1E08",
        go: "#3DDC97", // done
        gotint: "#0C2219",
      },
      fontFamily: {
        display: ["var(--font-display)", ...cjk, "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", ...cjk, "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", ...cjk, "ui-monospace", "monospace"],
      },
      maxWidth: { sheet: "1320px" },
    },
  },
  plugins: [],
} satisfies Config;
