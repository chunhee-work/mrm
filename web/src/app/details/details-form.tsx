"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileCard, { type Cred } from "@/components/app/profile-card";

export default function DetailsForm({ cred: cred0 }: { cred: Cred }) {
  const router = useRouter();
  const [cred, setCred] = useState(cred0);
  useEffect(() => setCred(cred0), [cred0]);
  return (
    <div className="wrap pb-14 pt-7 lg:pb-20 lg:pt-12">
      <div className="mx-auto max-w-[760px]">
        <ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact={cred.complete} look="page" />
      </div>
    </div>
  );
}
