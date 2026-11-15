import { pageMeta } from "@/lib/meta";

export { default } from "@/components/auth-layout";
export const generateMetadata = () => pageMeta("login.title");
export { lightViewport as viewport } from "@/lib/theme";
