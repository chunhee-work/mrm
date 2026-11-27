import { pageMeta } from "@/lib/meta";

export { default } from "@/components/app-layout";
export const generateMetadata = () => pageMeta("pf.title", { index: false });
export { lightViewport as viewport } from "@/lib/theme";
