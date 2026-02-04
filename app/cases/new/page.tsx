'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createCase } from "@/app/actions";
import { UploadCloud } from "lucide-react";

export default function NewCasePage() {
    const [isUploading, setIsUploading] = useState(false);

    return (
        <div className="container max-w-2xl mx-auto py-20">
            <h1 className="text-3xl font-bold mb-6">Create New Case</h1>
            <div className="bg-white p-8 border rounded-lg shadow-sm">
                <form action={createCase} onSubmit={() => setIsUploading(true)}>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-slate-50 transition mb-6">
                        <UploadCloud className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <label className="cursor-pointer">
                            <span className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition inline-block">
                                Select Documents
                            </span>
                            <input
                                name="files"
                                type="file"
                                multiple
                                required
                                className="hidden"
                                onChange={(e) => {
                                    const count = e.target.files?.length || 0;
                                    // Update UI feedback if needed
                                    const label = e.target.parentElement?.querySelector('span');
                                    if (label) label.textContent = `${count} files selected`;
                                }}
                            />
                        </label>
                        <p className="text-sm text-gray-500 mt-2">Upload PDFs or DOCX files (Schedule A, Family Info, Passports...)</p>
                    </div>

                    <Button type="submit" disabled={isUploading} className="w-full h-12 text-lg">
                        {isUploading ? "Uploading & Creating..." : "Create Case"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
