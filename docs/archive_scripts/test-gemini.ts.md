import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function run() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No API key");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const chat = model.startChat({ history: [] });
    const result = await chat.sendMessage("hola");
    console.log("Success:", result.response.text());
  } catch (e) {
    console.error("Gemini Error:", e);
  }
}
run();
