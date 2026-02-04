// Add this server action to app/actions.ts

export async function toggleFindingInEmail(caseId: string, findingId: string, include: boolean) {
    const caseData = await getCase(caseId);
    if (!caseData) throw new Error("Case not found");

    const finding = caseData.findings.find(f => f.id === findingId);
    if (finding) {
        finding.includeInEmail = include;
        await saveCase(caseData);
    }
}

export async function bulkToggleFindings(caseId: string, action: 'includeAll' | 'clearAll') {
    const caseData = await getCase(caseId);
    if (!caseData) throw new Error("Case not found");

    caseData.findings.forEach(f => {
        if (action === 'includeAll' && f.severity === 'ERROR') {
            f.includeInEmail = true;
        } else if (action === 'clearAll') {
            f.includeInEmail = false;
        }
    });

    await saveCase(caseData);
}
