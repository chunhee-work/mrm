import { pageMeta } from "@/lib/meta";

export { default } from "@/components/app-layout";
export const generateMetadata = () => pageMeta("case.title", { index: false });
