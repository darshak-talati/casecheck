import OpenAI from "openai";
const openai = new OpenAI({ apiKey: "test" });
console.log("beta?", !!openai.beta);
console.log("beta.chat?", !!openai.beta?.chat);
console.log("beta.chat.completions?", !!openai.beta?.chat?.completions);
console.log("parse?", !!openai.beta?.chat?.completions?.parse);
