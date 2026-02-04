import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listCases } from "@/lib/storage";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cases = await listCases();

  return (
    <div className="container max-w-4xl mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Immigration CaseCheck</h1>
        <Link href="/cases/new">
          <Button>New Case</Button>
        </Link>
      </div>

      <div className="grid gap-4">
        {cases.length === 0 ? (
          <div className="p-10 border rounded-lg text-center text-muted-foreground bg-slate-50">
            No cases found. Create one to get started.
          </div>
        ) : (
          cases.map(c => (
            <Link key={c.id} href={`/cases/${c.id}`}>
              <div className="p-6 border rounded-lg hover:shadow-md transition bg-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold">Case {c.id.slice(0, 8)}</h3>
                  <p className="text-sm text-muted-foreground">Created: {new Date(c.createdAt).toLocaleDateString()}</p>
                  <p className="text-sm">Members: {c.members.length} | Documents: {c.documents.length}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${c.findings.filter(f => f.severity === 'ERROR').length > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {c.findings.length} Findings
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
