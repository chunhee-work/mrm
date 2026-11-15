import { pageMeta } from "@/lib/meta";

export { default } from "@/components/auth-layout";
export const generateMetadata = () => pageMeta("signup.title");
export { lightViewport as viewport } from "@/lib/theme";
