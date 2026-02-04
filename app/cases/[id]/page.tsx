import { getCase, getRules } from "@/lib/storage";
import CaseResultView from "@/components/CaseResultView";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const caseData = await getCase(id);
    const rules = await getRules();

    if (!caseData) {
        notFound();
    }

    return <CaseResultView initialCase={caseData} initialRules={rules} />;
}
