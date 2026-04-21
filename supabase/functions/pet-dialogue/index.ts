const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK = { text: 'I love you both! ❤️', isFlashback: false };

type PetStats = {
  name?: string;
  type?: string;
  happiness?: number;
};

type CoupleProfile = {
  myName?: string;
  partnerName?: string;
  anniversaryDate?: string;
};

type Memory = {
  id?: string;
  text?: string;
  date?: string;
};

type Note = {
  content?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const trimText = (value: unknown, fallback: string, maxLength: number) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
};

const normalizeModelName = (value: string | undefined) => {
  const candidate = (value || 'gemini-2.5-flash').trim();
  return candidate.startsWith('models/') ? candidate : `models/${candidate}`;
};

const extractText = (payload: Record<string, unknown> | null): string | null => {
  if (!payload) return null;
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  const parts = Array.isArray(first?.content?.parts) ? first.content.parts : [];
  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text || null;
};

const buildPrompt = (stats: PetStats, profile: CoupleProfile, recentMemories: Memory[], recentNotes: Note[]) => {
  const now = new Date();
  const safeStats = {
    name: trimText(stats.name, 'Lior', 32),
    type: trimText(stats.type, 'pet', 32),
    happiness: Number.isFinite(stats.happiness) ? Math.max(0, Math.min(100, Number(stats.happiness))) : 50,
  };
  const safeProfile = {
    myName: trimText(profile.myName, 'love', 32),
    partnerName: trimText(profile.partnerName, 'partner', 32),
    anniversaryDate: typeof profile.anniversaryDate === 'string' ? profile.anniversaryDate : null,
  };

  const normalizedMemories = recentMemories
    .slice(0, 10)
    .map((memory) => ({
      id: typeof memory.id === 'string' ? memory.id : undefined,
      text: trimText(memory.text, '', 220),
      date: typeof memory.date === 'string' ? memory.date : undefined,
    }))
    .filter((memory) => memory.text && memory.date);

  const oldMemories = normalizedMemories.filter((memory) => {
    if (!memory.date) return false;
    const memoryDate = new Date(memory.date);
    if (Number.isNaN(memoryDate.getTime())) return false;
    const ageInDays = Math.floor((now.getTime() - memoryDate.getTime()) / (1000 * 86400));
    return ageInDays > 30;
  });

  const flashbackMemory = oldMemories.length > 0 && Math.random() > 0.7
    ? oldMemories[Math.floor(Math.random() * oldMemories.length)]
    : null;

  const lastMemory = normalizedMemories[0]?.text || 'none';
  const lastNote = trimText(recentNotes[0]?.content, 'none', 180);
  const anniversaryDate = safeProfile.anniversaryDate ? new Date(safeProfile.anniversaryDate) : null;
  const daysTogether = anniversaryDate && !Number.isNaN(anniversaryDate.getTime())
    ? Math.max(0, Math.floor((now.getTime() - anniversaryDate.getTime()) / (1000 * 86400)))
    : 0;

  const prompt = flashbackMemory
    ? `You are ${safeStats.name}, the cute mascot for ${safeProfile.myName} and ${safeProfile.partnerName}. You found an old memory from ${new Date(flashbackMemory.date || now.toISOString()).toLocaleDateString()}. The memory says: "${flashbackMemory.text}". Rules: act excited like you found a treasure, ask ${safeProfile.myName} if they remember this specific moment, keep it under 15 words, use 1-2 emojis, and respond with only the line you would say.`
    : `You are ${safeStats.name}, a cute digital ${safeStats.type} mascot for ${safeProfile.myName} and ${safeProfile.partnerName}. Context: relationship age ${daysTogether} days, recent memory "${lastMemory}", recent note "${lastNote}", happiness ${safeStats.happiness}/100. Rules: keep it under 15 words, be warm and slightly playful, occasionally mention a detail from the recent memory or note, use 1-2 emojis, address ${safeProfile.myName} directly, and respond with only the line you would say.`;

  return { flashbackMemory, prompt };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: {
    stats?: PetStats;
    profile?: CoupleProfile;
    recentMemories?: Memory[];
    recentNotes?: Note[];
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const stats = body.stats || {};
  const profile = body.profile || {};
  const recentMemories = Array.isArray(body.recentMemories) ? body.recentMemories : [];
  const recentNotes = Array.isArray(body.recentNotes) ? body.recentNotes : [];

  const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!apiKey) {
    console.warn('[pet-dialogue] GEMINI_API_KEY is missing. Returning fallback dialogue.');
    return json(FALLBACK);
  }

  const { flashbackMemory, prompt } = buildPrompt(stats, profile, recentMemories, recentNotes);
  const model = normalizeModelName(Deno.env.get('GEMINI_MODEL'));

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 80,
        },
      }),
    });

    if (!response.ok) {
      console.error('[pet-dialogue] Gemini request failed:', response.status, await response.text());
      return json({ text: 'Thinking of you both! ✨', isFlashback: false });
    }

    const payload = await response.json().catch(() => null);
    const text = extractText(payload);
    return json({
      text: text || FALLBACK.text,
      isFlashback: Boolean(flashbackMemory),
      memoryId: flashbackMemory?.id,
    });
  } catch (error) {
    console.error('[pet-dialogue] Gemini exception:', error);
    return json({ text: 'Thinking of you both! ✨', isFlashback: false });
  }
});
