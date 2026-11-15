import LegalPage from "@/components/legal-page";
import { TERMS } from "@/lib/legal";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = () => pageMeta("legal.terms", { desc: "meta.d.terms" });

export default function Terms() {
  return <LegalPage docs={TERMS} />;
}
