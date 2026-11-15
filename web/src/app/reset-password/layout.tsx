import { pageMeta } from "@/lib/meta";

export { default } from "@/components/auth-layout";
export const generateMetadata = () => pageMeta("reset.title", { index: false });
export { lightViewport as viewport } from "@/lib/theme";
