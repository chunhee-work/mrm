import type { Config } from "tailwindcss";

/** A colour token: an "r g b" triplet in a CSS variable, so opacity modifiers keep working. */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const cjk = ['"PingFang SC"', '"Noto Sans SC"', '"Microsoft YaHei"'];

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Two sets of the same tokens (values in globals.css, as CSS variables):
        // "Night Bay", an inspection bay at night, for the landing and the public site,
        // and a white working set (.theme-light) for the signed-in app and the account pages.
        // One light (ice) does the looking, amber marks what needs attention, green only ever means done.
        bay: v("bay"), // the room — page
        panel: v("panel"), // raised surface — cards, inputs, menus
        panel2: v("panel2"), // second level — hover, wells
        hair: v("hair"), // hairline
        hair2: v("hair2"), // a stronger hairline, for line drawings
        hairsoft: v("hairsoft"), // faint grid
        fg: v("fg"), // text
        mute: v("mute"), // secondary text
        ice: v("ice"), // primary buttons, links, focus (the scan light at night, ink on white)
        icehi: v("icehi"), // a primary button under the pointer
        icetint: v("icetint"), // quiet fill
        scan: v("scan"), // the scan light as a colour accent: progress, the lit edge of a panel
        amber: v("amber"), // damaged / needs attention / being keyed / error
        ambertint: v("ambertint"),
        go: v("go"), // done
        gotint: v("gotint"),
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
