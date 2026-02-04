import { NextRequest, NextResponse } from "next/server";
import { analyzeCase } from "@/app/actions";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        if (!body.caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });

        await analyzeCase(body.caseId);

        return NextResponse.json({ success: true, message: "Analysis complete" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
