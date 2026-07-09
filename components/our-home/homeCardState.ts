/**
 * OUR HOME — the live Home-tab card.
 *
 * One glance answers "is anything waiting for me in our room?" using the same
 * trace derivation the room itself renders — the card never invents presence,
 * it only surfaces it. Pure TS on purpose: this ships in the hot Home chunk,
 * so it must never pull the SVG catalog or any React.
 */
import type { OurHomeState } from './homeTypes';
import { deriveTraces } from './homeSoul';
import {
  coarsePhrase, hoursSince, isEveningHour, localDayKey, localHourForOffset, myTzOffsetMin,
} from './homeSky';

export type HomeCardTone = 'lamp' | 'fog' | 'note' | 'warm' | 'candle' | 'night' | 'still' | 'new';

export interface HomeCardPresence {
  tone: HomeCardTone;
  line: string;
}

/**
 * Priority mirrors the room's arrival hero: a light left burning beats a note
 * beats lingering warmth beats a candle. With nothing waiting, the card turns
 * into the evening doorway ("leave a light on") or a quiet invitation.
 */
export const describeHomeCard = (
  home: OurHomeState,
  myKey: string,
  partnerKey: string | null,
  partnerName: string,
  now: Date,
): HomeCardPresence => {
  if (!partnerKey) return { tone: 'new', line: 'Two sets of keys, one room' };
  const traces = deriveTraces(home, {
    myKey,
    partnerKey,
    partnerName,
    myPrevSeenAt: home.visits[myKey]?.lastSeenAt,
    now,
  });
  if (traces.some((t) => t.kind === 'lamp-left-on')) {
    return { tone: 'lamp', line: 'A light is on for you' };
  }
  if (home.fog.by === partnerKey && home.fog.at && !home.fog.seenAt
    && hoursSince(home.fog.at, now) < 20) {
    return { tone: 'fog', line: `${partnerName} wrote on your window` };
  }
  if (traces.some((t) => t.kind === 'note')) {
    return { tone: 'note', line: `${partnerName} left you something` };
  }
  if (traces.some((t) => t.kind === 'lamp-warmth')) {
    const phrase = coarsePhrase(home.visits[partnerKey]?.lastSeenAt, now);
    return { tone: 'warm', line: `${partnerName} was home ${phrase ?? 'a little while ago'}` };
  }
  if (traces.some((t) => t.kind === 'candle')) {
    return { tone: 'candle', line: `${partnerName} is thinking of you` };
  }
  const myHour = localHourForOffset(myTzOffsetMin(now), now);
  const hasLamp = home.objects.some(
    (o) => (o.sku === 'lamp-a' || o.sku === 'lamp-b') && !o.stored && !o.removed,
  );
  if (isEveningHour(myHour) && hasLamp && home.night[myKey]?.dimmedDay !== localDayKey(now)) {
    return { tone: 'night', line: `Leave a light on for ${partnerName}` };
  }
  return { tone: 'still', line: 'Come home for a minute' };
};
