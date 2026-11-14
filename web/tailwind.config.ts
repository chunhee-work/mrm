import type { Config } from "tailwindcss";

const cjk = ['"PingFang SC"', '"Noto Sans SC"', '"Microsoft YaHei"'];

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6FA", // cool paper white — page
        ink: "#1838A8", // drafting ink blue — lines, headlines, primary buttons
        deep: "#0B1533", // deep ink — body text
        mute: "#4B587C", // deep ink, thinned — secondary text
        hair: "#C9D2E6", // hairline blue-grey
        hairsoft: "#E3E8F2", // drafting grid
        inktint: "#EDF1FA", // glass / quiet fills
        signal: "#FF8A1F", // hazard amber — damaged / needs attention / being keyed
        signaltint: "#FFF1E1",
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
