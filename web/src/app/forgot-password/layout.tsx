import { pageMeta } from "@/lib/meta";

export { default } from "@/components/auth-layout";
export const generateMetadata = () => pageMeta("forgot.title", { index: false });
