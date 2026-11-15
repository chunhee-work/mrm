import { pageMeta } from "@/lib/meta";

export { default } from "@/components/auth-layout";
export const generateMetadata = () => pageMeta("forgot.title", { index: false });
export { lightViewport as viewport } from "@/lib/theme";
