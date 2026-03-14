
import { GoogleGenAI } from "@google/genai";
import { Memory, Note, PetStats, CoupleProfile } from "../types";

export const PetAIService = {
  async generateDialogue(
    stats: PetStats,
    profile: CoupleProfile,
    recentMemories: Memory[],
    recentNotes: Note[]
  ): Promise<{ text: string; isFlashback: boolean; memoryId?: string }> {
    const apiKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || ((process as any).env?.API_KEY as string) || "";
    if (!apiKey) {
      console.warn("No Gemini API key found. Using fallback dialogue.");
      return { text: "I love you both! ❤️", isFlashback: false };
    }
    const ai = new GoogleGenAI({ apiKey });

    // Logic for Feature 4: Memory Prompting
    // Look for a memory that is exactly N months/years old, or just a random old one
    const now = new Date();
    const oldMemories = recentMemories.filter(m => {
      const ageInDays = Math.floor((now.getTime() - new Date(m.date).getTime()) / (1000 * 86400));
      return ageInDays > 30; // Older than a month
    });

    const flashbackMemory = oldMemories.length > 0 && Math.random() > 0.7
      ? oldMemories[Math.floor(Math.random() * oldMemories.length)]
      : null;

    const lastMemory = recentMemories[0]?.text || "none";
    const lastNote = recentNotes[0]?.content || "none";
    const daysTogether = Math.floor((Date.now() - new Date(profile.anniversaryDate).getTime()) / (1000 * 86400));

    const prompt = flashbackMemory
      ? `
      You are ${stats.name}, the cute mascot for ${profile.myName} and ${profile.partnerName}.
      You just found an old memory in the vault from ${new Date(flashbackMemory.date).toLocaleDateString()}.
      The memory says: "${flashbackMemory.text}".
      
      Rules:
      1. Act excited like you just found a treasure.
      2. Ask ${profile.myName} if they remember this specific moment.
      3. Keep it under 15 words.
      4. Use 1-2 emojis.
      `
      : `
      You are ${stats.name}, a cute digital ${stats.type} mascot for ${profile.myName} and ${profile.partnerName}.
      Context: Relationship age ${daysTogether} days. Recent memory: "${lastMemory}". Happiness: ${stats.happiness}/100.
      
      Rules:
      1. Keep it under 15 words.
      2. Be extremely cute and slightly playful.
      3. Occasionally mention details from the recent memory.
      4. Use 1-2 emojis.
      5. Address ${profile.myName} directly.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
      });
      const text = response.text;
      return {
        text: text || "I love you both! ❤️",
        isFlashback: !!flashbackMemory,
        memoryId: flashbackMemory?.id
      };
    } catch (e) {
      console.error("Pet AI Error:", e);
      return { text: "Thinking of you both! ✨", isFlashback: false };
    }
  }
};
