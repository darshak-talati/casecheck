'use client';

import { useState } from "react";
import { Case, Finding, Rule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle, CheckCircle, RefreshCw, Mail, Settings, CheckSquare, Square } from "lucide-react";
import { analyzeCase, updateRule, toggleFindingInEmail, bulkToggleFindings } from "@/app/actions";

export default function CaseResultView({ initialCase, initialRules }: { initialCase: Case, initialRules?: Rule[] }) {
    const [caseData, setCaseData] = useState<Case>(initialCase);
    const [rules, setRules] = useState<Rule[]>(initialRules || []);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<"docs" | "findings" | "email" | "rules">("docs");
    const [showVerified, setShowVerified] = useState(false);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        try {
            await analyzeCase(caseData.id);
            window.location.reload();
        } catch (e) {
            alert("Analysis failed: " + e);
            setIsAnalyzing(false);
        }
    };

    const handleToggleRule = async (rule: Rule) => {
        const updated = { ...rule, active: !rule.active };
        setRules(rules.map(r => r.id === rule.id ? updated : r));
        await updateRule(updated);
    };

    const handleToggleFinding = async (findingId: string, include: boolean) => {
        const updatedFindings = caseData.findings.map(f =>
            f.id === findingId ? { ...f, includeInEmail: include } : f
        );
        setCaseData({ ...caseData, findings: updatedFindings });
        await toggleFindingInEmail(caseData.id, findingId, include);
    };

    const handleBulkToggle = async (action: 'includeAll' | 'clearAll') => {
        const updatedFindings = caseData.findings.map(f => {
            if (action === 'includeAll' && f.severity === 'ERROR') return { ...f, includeInEmail: true };
            if (action === 'clearAll') return { ...f, includeInEmail: false };
            return f;
        });
        setCaseData({ ...caseData, findings: updatedFindings });
        await bulkToggleFindings(caseData.id, action);
    };

    const findingsByMember = caseData.findings.reduce((acc, f) => {
        const m = f.memberName || "General";
        if (!acc[m]) acc[m] = [];
        acc[m].push(f);
        return acc;
    }, {} as Record<string, Finding[]>);

    const generateEmail = () => {
        const selectedFindings = caseData.findings.filter(f => f.includeInEmail);
        if (selectedFindings.length === 0) return "No findings selected for email.";

        const lines = ["Dear Client,\n\nWe have reviewed your documents and found the following items to address:\n"];

        // Group selected findings by member
        const grouped = selectedFindings.reduce((acc, f) => {
            const m = f.memberName || "General";
            if (!acc[m]) acc[m] = [];
            acc[m].push(f);
            return acc;
        }, {} as Record<string, Finding[]>);

        Object.entries(grouped).forEach(([name, findings]) => {
            lines.push(`\n### ${name}`);
            findings.forEach(f => {
                lines.push(`- [${f.severity}] ${f.clientMessage}`);
                if (f.recommendation) lines.push(`  *Action: ${f.recommendation}*`);
            });
        });
        lines.push("\nPlease provide the detailed information/documents for the above items.\n\nRegards,\nImmigration Team");
        return lines.join("\n");
    };

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Case Dashboard</h1>
                    <p className="text-muted-foreground">{caseData.members.length} Members | {caseData.documents.length} Documents</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => window.location.href = '/'}>All Cases</Button>
                    <Button onClick={handleAnalyze} disabled={isAnalyzing}>
                        {isAnalyzing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Run Analysis
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-8">
                {/* Sidebar */}
                <div className="col-span-3 space-y-6">
                    <div className="bg-slate-50 p-4 rounded-lg border">
                        <h3 className="font-semibold mb-3">Members</h3>
                        {caseData.members.length === 0 && <p className="text-sm text-gray-500">No members identified yet.</p>}
                        <ul className="space-y-2">
                            {caseData.members.map(m => (
                                <li key={m.id} className="text-sm bg-white p-2 border rounded shadow-sm">
                                    <span className="font-medium">{m.fullName}</span>
                                    <div className="text-xs text-gray-500">{m.relationship} • {m.age ? `${m.age} yrs` : 'Age unknown'}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Main Content */}
                <div className="col-span-9">
                    {/* Tabs Header */}
                    <div className="flex border-b mb-6">
                        <button onClick={() => setActiveTab("docs")} className={`px-4 py-2 font-medium ${activeTab === 'docs' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}>
                            Documents
                        </button>
                        <button onClick={() => setActiveTab("findings")} className={`px-4 py-2 font-medium ${activeTab === 'findings' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}>
                            Findings ({caseData.findings.length})
                        </button>
                        <button onClick={() => setActiveTab("email")} className={`px-4 py-2 font-medium ${activeTab === 'email' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}>
                            Email Draft
                        </button>
                        <button onClick={() => setActiveTab("rules")} className={`px-4 py-2 font-medium ${activeTab === 'rules' ? 'border-b-2 border-primary text-primary' : 'text-gray-500'}`}>
                            Rules
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === "docs" && (
                        <div className="grid gap-4">
                            {caseData.documents.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between p-4 border rounded hover:bg-slate-50">
                                    <div className="flex items-center gap-3">
                                        <FileText className="text-blue-500" />
                                        <div>
                                            <p className="font-medium">{doc.filename}</p>
                                            <div className="flex gap-2 text-xs">
                                                <span className="bg-gray-100 px-1 rounded">{doc.kind}</span>
                                                {doc.formType && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded uppercase tracking-wide font-bold">{doc.formType.replace('_', ' ')}</span>}
                                                {doc.supportType && <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">{doc.supportType}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {doc.personId ? caseData.members.find(m => m.id === doc.personId)?.fullName : "Unassigned"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === "findings" && (
                        <div className="space-y-8">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showVerified}
                                            onChange={(e) => setShowVerified(e.target.checked)}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        Show Verified Checks
                                    </label>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleBulkToggle('includeAll')}>Include All Errors</Button>
                                    <Button variant="outline" size="sm" onClick={() => handleBulkToggle('clearAll')}>Clear Selection</Button>
                                </div>
                            </div>

                            {/* Section: Issues to Fix */}
                            <div>
                                <h3 className="text-xl font-bold text-red-700 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" /> Issues to Fix
                                </h3>
                                {Object.keys(findingsByMember).filter(m => findingsByMember[m].some(f => f.status === 'FAIL')).length === 0 ? (
                                    <div className="text-center py-10 bg-slate-50 rounded-lg border-2 border-dashed">
                                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                                        <h3 className="text-lg font-medium text-gray-900">No issues found</h3>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {Object.entries(findingsByMember).map(([member, list]) => {
                                            const failures = list.filter(f => f.status === 'FAIL');
                                            if (failures.length === 0) return null;
                                            return (
                                                <div key={`fail-${member}`}>
                                                    <h4 className="font-bold text-md mb-2 text-gray-700">{member}</h4>
                                                    <div className="space-y-3">
                                                        {failures.map(f => (
                                                            <div key={f.id} className={`p-4 border-l-4 rounded shadow-sm bg-white flex gap-4 ${f.severity === 'ERROR' ? 'border-red-500' : 'border-yellow-500'}`}>
                                                                <div className="flex-shrink-0 pt-1">
                                                                    <button
                                                                        onClick={() => handleToggleFinding(f.id, !f.includeInEmail)}
                                                                        className="text-gray-400 hover:text-primary transition-colors"
                                                                        title={f.includeInEmail ? "Remove from email" : "Include in email"}
                                                                    >
                                                                        {f.includeInEmail ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
                                                                    </button>
                                                                </div>
                                                                <div className="flex-grow">
                                                                    <div className="flex justify-between">
                                                                        <h4 className="font-semibold">{f.summary}</h4>
                                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${f.severity === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                                            {f.severity}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{f.clientMessage}</p>
                                                                    {f.recommendation && <p className="text-xs text-gray-500 mt-2 italic font-medium">Recommendation: {f.recommendation}</p>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Section: Verified Checks */}
                            {showVerified && (
                                <div className="pt-6 border-t">
                                    <h3 className="text-xl font-bold text-green-700 mb-4 flex items-center gap-2">
                                        <CheckCircle className="w-5 h-5" /> Verified Checks
                                    </h3>
                                    <div className="space-y-4">
                                        {Object.entries(findingsByMember).map(([member, list]) => {
                                            const passes = list.filter(f => f.status === 'PASS');
                                            if (passes.length === 0) return null;
                                            return (
                                                <div key={`pass-${member}`}>
                                                    <h4 className="font-bold text-sm mb-2 text-gray-500 uppercase tracking-tight">{member}</h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {passes.map(f => (
                                                            <div key={f.id} className="p-3 border rounded-lg bg-green-50/30 flex gap-3 items-start border-green-100 shadow-sm transition-all hover:bg-green-50/50">
                                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                                <div className="flex-grow">
                                                                    <div className="flex justify-between items-start gap-2">
                                                                        <h5 className="text-sm font-semibold text-green-900">{f.verifiedLabel || f.summary}</h5>
                                                                        <span className="text-[9px] font-bold bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Verified</span>
                                                                    </div>
                                                                    <p className="text-xs text-green-700/80 mt-0.5 whitespace-pre-line">{f.clientMessage}</p>
                                                                    {f.details && f.details.scheduleRow && (
                                                                        <div className="mt-2 p-2 bg-white/60 rounded border border-green-100 text-[10px] space-y-1">
                                                                            <p className="font-bold text-green-800 uppercase text-[9px]">Verification Trace</p>
                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                <div>
                                                                                    <p className="text-gray-500">Schedule Row:</p>
                                                                                    <p className="font-medium">{f.details.scheduleRow.fieldOfStudy} @ {f.details.scheduleRow.institution}</p>
                                                                                    <p>{f.details.scheduleRow.fromMonth} to {f.details.scheduleRow.toMonth}</p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-gray-500">Evidence Found:</p>
                                                                                    <p className="font-medium">{f.details.evidence.credential} at {f.details.evidence.institution}</p>
                                                                                    <p className="italic">" {f.details.anchor.snippet} "</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="mt-1 pt-1 border-t border-green-100 flex justify-between items-center text-gray-500">
                                                                                <span>Match Score: {Math.round(f.details.score * 100)}%</span>
                                                                                <span>Anchor: {f.details.anchor.kind.replace('_', ' ')}</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {f.details && (
                                                                        <details className="mt-1">
                                                                            <summary className="text-[10px] text-green-600 cursor-pointer hover:underline">View Raw JSON</summary>
                                                                            <pre className="mt-1 text-[9px] bg-white/50 p-2 rounded border border-green-100 overflow-auto max-h-32">
                                                                                {JSON.stringify(f.details, null, 2)}
                                                                            </pre>
                                                                        </details>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "email" && (
                        <div className="h-full">
                            <div className="bg-slate-100 p-4 rounded-t-lg border-b flex justify-between items-center">
                                <h3 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4" /> Client Email Draft</h3>
                                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(generateEmail())}>Copy</Button>
                            </div>
                            <textarea
                                className="w-full h-[500px] p-4 border-x border-b rounded-b-lg font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 ring-primary"
                                defaultValue={generateEmail()}
                            />
                        </div>
                    )}

                    {activeTab === "rules" && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-lg">Active Rules</h3>
                                <p className="text-sm text-gray-500">Toggle or configure rules for next analysis.</p>
                            </div>
                            {rules.map(rule => (
                                <div key={rule.id} className="p-4 border rounded flex justify-between items-start bg-white">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold">{rule.name}</h4>
                                            <span className={`text-xs px-2 py-0.5 rounded ${rule.severity === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                {rule.severity}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                                        <p className="text-xs text-gray-400 mt-1 font-mono">{rule.id} • {rule.type}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center cursor-pointer gap-2">
                                            <span className="text-sm">{rule.active ? "On" : "Off"}</span>
                                            <input
                                                type="checkbox"
                                                className="toggle"
                                                checked={rule.active}
                                                onChange={() => handleToggleRule(rule)}
                                            />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
