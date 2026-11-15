import LegalPage from "@/components/legal-page";
import { PRIVACY } from "@/lib/legal";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = () => pageMeta("legal.privacy", { desc: "meta.d.privacy" });

export default function Privacy() {
  return <LegalPage docs={PRIVACY} />;
}
