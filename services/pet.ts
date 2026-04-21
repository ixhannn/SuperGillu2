import { Memory, Note, PetStats, CoupleProfile } from "../types";
import { SupabaseService } from "./supabase";

const FALLBACK_DIALOGUE = { text: "I love you both! ❤️", isFlashback: false } as const;

const buildFunctionHeaders = async (): Promise<Record<string, string> | null> => {
  const { anonKey } = SupabaseService.getProjectConfig();
  if (!anonKey) return null;

  const accessToken = SupabaseService.init()
    ? await SupabaseService.getAccessToken()
    : null;

  return {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`,
  };
};

export const PetAIService = {
  async generateDialogue(
    stats: PetStats,
    profile: CoupleProfile,
    recentMemories: Memory[],
    recentNotes: Note[],
  ): Promise<{ text: string; isFlashback: boolean; memoryId?: string }> {
    const { url } = SupabaseService.getProjectConfig();
    if (!url) {
      console.warn("Supabase is not configured. Using fallback pet dialogue.");
      return FALLBACK_DIALOGUE;
    }

    const headers = await buildFunctionHeaders();
    if (!headers) {
      console.warn("Missing Supabase anon key. Using fallback pet dialogue.");
      return FALLBACK_DIALOGUE;
    }

    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/pet-dialogue`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          stats,
          profile,
          recentMemories,
          recentNotes,
        }),
      });

      if (!response.ok) {
        console.warn("Pet dialogue request failed:", response.status, await response.text());
        return FALLBACK_DIALOGUE;
      }

      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload.text !== "string" || !payload.text.trim()) {
        return FALLBACK_DIALOGUE;
      }

      return {
        text: payload.text,
        isFlashback: Boolean(payload.isFlashback),
        memoryId: typeof payload.memoryId === "string" ? payload.memoryId : undefined,
      };
    } catch (e) {
      console.error("Pet AI Error:", e);
      return { text: "Thinking of you both! ✨", isFlashback: false };
    }
  }
};
