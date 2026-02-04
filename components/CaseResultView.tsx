'use client';

import { useState } from "react";
import { Case, Finding, Rule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { analyzeCase, updateRule } from "@/app/actions";
import { FileText, AlertTriangle, CheckCircle, RefreshCw, Mail, Settings } from "lucide-react";

export default function CaseResultView({ initialCase, initialRules }: { initialCase: Case, initialRules?: Rule[] }) {
    const [caseData, setCaseData] = useState<Case>(initialCase);
    const [rules, setRules] = useState<Rule[]>(initialRules || []);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<"docs" | "findings" | "email" | "rules">("docs");

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
        setRules(rules.map(r => r.id === r.id ? (r.id === rule.id ? updated : r) : r));
        await updateRule(updated);
    };

    const findingsByMember = caseData.findings.reduce((acc, f) => {
        const m = f.memberName || "General";
        if (!acc[m]) acc[m] = [];
        acc[m].push(f);
        return acc;
    }, {} as Record<string, Finding[]>);

    const generateEmail = () => {
        const lines = ["Dear Client,\n\nWe have reviewed your documents and found the following items to address:\n"];
        Object.entries(findingsByMember).forEach(([name, findings]) => {
            lines.push(`\n### ${name}`);
            findings.forEach(f => {
                if (f.severity === "ERROR" || f.severity === "WARNING") {
                    lines.push(`- [${f.severity}] ${f.clientMessage}`);
                }
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
                                                {doc.formType && <span className="bg-blue-100 text-blue-800 px-1 rounded">{doc.formType}</span>}
                                                {doc.supportType && <span className="bg-green-100 text-green-800 px-1 rounded">{doc.supportType}</span>}
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
                        <div className="space-y-6">
                            {Object.entries(findingsByMember).map(([member, list]) => (
                                <div key={member}>
                                    <h3 className="font-bold text-lg mb-2">{member}</h3>
                                    <div className="space-y-3">
                                        {list.map(f => (
                                            <div key={f.id} className={`p-4 border-l-4 rounded shadow-sm bg-white ${f.severity === 'ERROR' ? 'border-red-500' : f.severity === 'WARNING' ? 'border-yellow-500' : 'border-blue-500'}`}>
                                                <div className="flex justify-between">
                                                    <h4 className="font-semibold">{f.summary}</h4>
                                                    <span className="text-xs font-bold uppercase tracking-wider">{f.severity}</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1">{f.recommendation}</p>
                                                <p className="text-xs text-gray-400 mt-2 font-mono">{f.ruleId}</p>
                                                {f.details && (
                                                    <details className="mt-2 text-xs">
                                                        <summary className="cursor-pointer text-blue-600">View Details</summary>
                                                        <pre className="mt-1 bg-gray-100 p-2 rounded overflow-auto">
                                                            {JSON.stringify(f.details, null, 2)}
                                                        </pre>
                                                    </details>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
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
