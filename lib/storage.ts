import fs from "fs/promises";
import path from "path";
import { Case, CaseSchema, Rule, RuleSchema } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const CASES_DIR = path.join(DATA_DIR, "cases");
const RULES_FILE = path.join(DATA_DIR, "rules", "rules.json");

export async function getCase(caseId: string): Promise<Case | null> {
    try {
        const filePath = path.join(CASES_DIR, `${caseId}.json`);
        const data = await fs.readFile(filePath, "utf-8");
        return CaseSchema.parse(JSON.parse(data));
    } catch (error) {
        return null;
    }
}

export async function saveCase(caseData: Case): Promise<void> {
    const filePath = path.join(CASES_DIR, `${caseData.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(caseData, null, 2));
}

export async function listCases(): Promise<Case[]> {
    try {
        const files = await fs.readdir(CASES_DIR);
        const cases: Case[] = [];
        for (const file of files) {
            if (file.endsWith(".json")) {
                const data = await fs.readFile(path.join(CASES_DIR, file), "utf-8");
                try {
                    cases.push(CaseSchema.parse(JSON.parse(data)));
                } catch (e) {
                    console.error(`Failed to parse case ${file}`, e);
                }
            }
        }
        return cases.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (error) {
        return [];
    }
}

export async function getRules(): Promise<Rule[]> {
    try {
        const data = await fs.readFile(RULES_FILE, "utf-8");
        const json = JSON.parse(data);
        return json.map((r: any) => RuleSchema.parse(r));
    } catch (error) {
        return [];
    }
}

export async function saveRules(rules: Rule[]): Promise<void> {
    await fs.writeFile(RULES_FILE, JSON.stringify(rules, null, 2));
}
