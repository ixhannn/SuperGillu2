import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BookOpen, Check, CloudRain, Droplets, Feather, Flower2, Share2, Sparkles, Sprout, TreePine, UserPlus } from 'lucide-react';
import { ViewState } from '../types';
import { BonsaiService } from '../services/bonsai';
import { BonsaiShareService } from '../services/bonsaiShare';
import { NotificationsService } from '../services/notifications';
import { StorageService } from '../services/storage';
import { syncEventTarget } from '../services/sync';
import { canPlantNext, computeGarden, computeTreeState, seasonFor } from '../utils/bonsai/growth';
import { daysTogetherFrom } from '../shared/dateOnly.js';
import { createBonsaiShareCard } from '../utils/bonsai/shareCard';
import { BONSAI_SPECIES, type BonsaiSpeciesId } from '../utils/bonsai/voxelModel';
import type { BlossomNote, BonsaiEvent } from '../utils/bonsai/types';
import { BonsaiScene, type BonsaiSceneHandle } from '../components/bonsai/BonsaiScene';
import { WaterButton } from '../components/bonsai/WaterButton';
import {
  BonsaiComposeSheet,
  BonsaiDaySheet,
  BonsaiGroveSheet,
  BonsaiReadSheet,
  BonsaiSpeciesPicker,
  BonsaiStorySheet,
} from '../components/bonsai/BonsaiSheets';
import { ViewHeader } from '../components/ViewHeader';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { prefersReducedMotion } from '../utils/motion';
import '../styles/bonsai.css';

interface BonsaiBloomProps {
  setView: (view: ViewState) => void;
}

/* ── TEMPORARY dev-only age scrubber (e2e preview only, not committed) ── */

const DEV_AGE_ENABLED =
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('e2e') === '1';

const seedAgeDays = (days: number): BonsaiEvent[] => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const events: BonsaiEvent[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const day = key(d);
    const note = i === 1 ? 'thinking of you at the bus stop' : i === 5 ? 'you make ordinary days lucky' : null;
    events.push({
      id: `solo_${day}_me_w`, coupleId: 'solo', authorId: 'me', type: 'water',
      day, note: i === 5 ? note : null, targetEventId: null, createdAt: `${day}T19:00:00.000Z`,
    });
    events.push({
      id: `solo_${day}_partner_w`, coupleId: 'solo', authorId: 'partner-sim', type: 'water',
      day, note: i === 1 ? note : null, targetEventId: null, createdAt: `${day}T19:01:00.000Z`,
    });
  }
  return events;
};

function DevAgePanel({ onSeed }: { onSeed: (events: BonsaiEvent[]) => void }) {
  const [days, setDays] = useState(0);
  const debounceRef = useRef<number | null>(null);
  // A range drag fires dozens of change events per second; each seed+rerender
  // costs tens of ms, so applying on EVERY tick queued seconds of main-thread
  // work and froze the page. Label updates live; the tree re-seeds only once
  // the value settles.
  const apply = (n: number, immediate = false) => {
    setDays(n);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    const run = () => {
      debounceRef.current = null;
      const events = seedAgeDays(n);
      try {
        localStorage.setItem('lior_bonsai_events_v1', JSON.stringify({ coupleKey: 'solo', events, pendingIds: [] }));
        localStorage.removeItem('lior_bonsai_seen_v1');
      } catch { /* dev only */ }
      onSeed(events);
    };
    if (immediate) run();
    else debounceRef.current = window.setTimeout(run, 160);
  };
  return (
    <div
      className="bonsai-devpanel"
      style={{
        position: 'fixed', top: 70, left: 10, zIndex: 99,
        background: 'rgba(255,252,252,0.92)', borderRadius: 14, padding: '8px 12px',
        boxShadow: '0 6px 18px rgba(45,31,37,0.18)', fontSize: 11, color: '#7c626a',
        display: 'flex', flexDirection: 'column', gap: 4, width: 190,
      }}
    >
      <strong style={{ color: '#2d1f25' }}>Tree age: {days} days (dev)</strong>
      <input
        type="range"
        min={0}
        max={140}
        value={days}
        onChange={(e) => apply(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[0, 3, 10, 30, 60, 100, 134].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => apply(n, true)}
            style={{
              border: '1px solid rgba(196,104,126,0.35)', borderRadius: 8, background: 'transparent',
              color: '#c4687e', fontSize: 10, padding: '2px 7px', cursor: 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

const SEEN_GROWTH_KEY = 'lior_bonsai_seen_v1';

const skyPhaseFor = (hour: number): SkyPhase => {
  if (hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  if (hour < 20) return 'dusk';
  return 'night';
};

// Keyed per couple AND tree index — a replant must not inherit the finished
// tree's high-water mark (it would suppress the new tree's first time-lapse).
const readSeenGrowth = (treeKey: string): number | null => {
  try {
    const raw = localStorage.getItem(SEEN_GROWTH_KEY);
    const parsed = raw ? (JSON.parse(raw) as { coupleKey: string; growth: number }) : null;
    return parsed && parsed.coupleKey === treeKey ? parsed.growth : null;
  } catch {
    return null;
  }
};

const writeSeenGrowth = (treeKey: string, growth: number): void => {
  try {
    localStorage.setItem(SEEN_GROWTH_KEY, JSON.stringify({ coupleKey: treeKey, growth }));
  } catch {
    /* non-fatal */
  }
};

/** Today is the couple's anniversary (month + day match). */
const isAnniversaryToday = (anniversaryDate: string | undefined, today: string): boolean => {
  if (!anniversaryDate) return false;
  const md = anniversaryDate.slice(5, 10);
  return md.length === 5 && md === today.slice(5, 10);
};

export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
  const seed = useMemo(() => BonsaiService.seed(), []);
  const selfId = useMemo(() => BonsaiService.selfId(), []);
  const partnerName = useMemo(() => BonsaiService.partnerName(), []);
  const myName = useMemo(() => BonsaiService.myName(), []);
  const paired = useMemo(() => BonsaiService.isPaired(), []);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const [events, setEvents] = useState<BonsaiEvent[]>(() => BonsaiService.getCachedEvents());
  const [today, setToday] = useState(() => BonsaiService.today());
  const [hour, setHour] = useState(() => new Date().getHours());
  const [composeOpen, setComposeOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [groveOpen, setGroveOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readingNote, setReadingNote] = useState<BlossomNote | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [nudgedToday, setNudgedToday] = useState(
    () => {
      try {
        return localStorage.getItem('lior_bonsai_nudge_day') === BonsaiService.today();
      } catch {
        return false;
      }
    },
  );
  const [stageBanner, setStageBanner] = useState<{ name: string; line: string } | null>(null);
  const [partnerHere, setPartnerHere] = useState(false);
  const [sharing, setSharing] = useState(false);

  const sceneRef = useRef<BonsaiSceneHandle | null>(null);
  const presenceOffTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = BonsaiService.subscribe(setEvents);
    void BonsaiService.refresh().then(setEvents);
    const clock = window.setInterval(() => {
      setToday(BonsaiService.today());
      setHour(new Date().getHours());
    }, 60_000);
    return () => {
      unsubscribe();
      window.clearInterval(clock);
    };
  }, []);

  // ── Presence: "together right now" (Home's grace-window pattern) ────
  useEffect(() => {
    if (!paired) return;
    const handlePresence = (e: Event) => {
      const state = (e as CustomEvent).detail as Record<string, { user?: string }[]> | null;
      const prof = StorageService.getCoupleProfile();
      let online = false;
      if (state) {
        Object.values(state).forEach((presences) => {
          presences.forEach((p) => {
            if (p.user && p.user === prof.partnerName) online = true;
          });
        });
      }
      if (online) {
        if (presenceOffTimerRef.current !== null) {
          window.clearTimeout(presenceOffTimerRef.current);
          presenceOffTimerRef.current = null;
        }
        setPartnerHere(true);
      } else if (presenceOffTimerRef.current === null) {
        // Hold through the empty presence sync realtime emits on reconnect.
        presenceOffTimerRef.current = window.setTimeout(() => {
          presenceOffTimerRef.current = null;
          setPartnerHere(false);
        }, 6000);
      }
    };
    syncEventTarget.addEventListener('presence-update', handlePresence);
    return () => {
      if (presenceOffTimerRef.current !== null) window.clearTimeout(presenceOffTimerRef.current);
      syncEventTarget.removeEventListener('presence-update', handlePresence);
    };
  }, [paired]);

  const garden = useMemo(() => computeGarden(events, seed), [events, seed]);
  const tree = useMemo(
    () => computeTreeState({ events: garden.currentEvents, seed: garden.currentSeed, today, selfId }),
    [garden, today, selfId],
  );
  const season = useMemo(() => seasonFor(today), [today]);
  const anniversary = useMemo(
    () => isAnniversaryToday(StorageService.getCoupleProfile().anniversaryDate, today),
    [today],
  );

  // ── Comeback time-lapse: replay what grew since you last looked ─────
  const timelapseDoneRef = useRef(false);
  const treeKey = `${BonsaiService.coupleKey()}:${garden.currentIndex}`;
  useEffect(() => {
    if (timelapseDoneRef.current || tree.growth === 0) return;
    timelapseDoneRef.current = true;
    const seen = readSeenGrowth(treeKey);
    if (seen != null && tree.growth - seen >= 3) {
      window.setTimeout(() => sceneRef.current?.timelapse(seen), 450);
    }
  }, [tree.growth, treeKey]);
  useEffect(() => {
    if (tree.growth > 0) writeSeenGrowth(treeKey, tree.growth);
  }, [tree.growth, treeKey]);

  // ── Moment detection (partner watered live, bloom completed, stage up,
  //    partner arrived) ─────────────────────────────────────────────────
  const prevRef = useRef<{ partner: boolean; bloom: boolean; stageId: string } | null>(null);
  useEffect(() => {
    const bloomToday = tree.wateredTodayByMe && tree.wateredTodayByPartner;
    const prev = prevRef.current;
    if (prev) {
      if (!prev.partner && tree.wateredTodayByPartner) {
        feedback.tap();
        toast.show(`${partnerName} just watered your bonsai`, 'heart');
      }
      if (!prev.bloom && bloomToday) {
        feedback.milestone();
        sceneRef.current?.celebrate(tree.mood.golden);
        toast.show('You both showed up — a new blossom opened', 'success', 4000);
      }
      if (prev.stageId !== tree.stage.id && tree.growth > 0) {
        setStageBanner({ name: tree.stage.name, line: tree.stage.line });
        window.setTimeout(() => setStageBanner(null), 4200);
      }
    }
    prevRef.current = { partner: tree.wateredTodayByPartner, bloom: bloomToday, stageId: tree.stage.id };
  }, [tree, partnerName]);

  const prevHereRef = useRef(false);
  useEffect(() => {
    if (partnerHere && !prevHereRef.current) {
      sceneRef.current?.swirl();
      feedback.tapSilent();
    }
    prevHereRef.current = partnerHere;
  }, [partnerHere]);

  const handleWatered = () => {
    feedback.confirm();
    if (tree.resting) toast.show('The tree stirs awake — it missed you', 'info');
    const completesBloom = tree.wateredTodayByPartner && !tree.wateredTodayByMe;
    void BonsaiService.water(undefined, garden.currentIndex).then(() => {
      if (!paired) return;
      // The outside-the-app loop: their phone hears about it.
      void NotificationsService.triggerBonsaiPush(completesBloom ? 'bloomed' : 'watered', myName);
    });
    if (partnerHere) sceneRef.current?.swirl();
  };

  const handleSaveNote = (text: string) => {
    feedback.confirm();
    void BonsaiService.setTodayNote(text, garden.currentIndex);
    toast.show(`Sealed until ${partnerName} waters the tree`, 'heart');
  };

  const handleNoteOpened = (note: BlossomNote) => {
    void BonsaiService.markNoteOpened(note.eventId);
    if (paired) void NotificationsService.triggerBonsaiPush('note_read', myName);
  };

  const segment = garden.currentEvents;
  const firstDay = segment.length > 0 ? segment.reduce((min, e) => (e.day < min ? e.day : min), segment[0].day) : null;
  const treeAge = firstDay ? daysTogetherFrom(firstDay, today) + 1 : 0;
  const sky = skyPhaseFor(hour);
  const night = sky === 'night';

  const handleNudge = () => {
    feedback.tap();
    setNudgedToday(true);
    try {
      localStorage.setItem('lior_bonsai_nudge_day', today);
    } catch { /* non-fatal */ }
    void NotificationsService.triggerBonsaiPush('nudge', myName);
    toast.show(`A gentle reminder is on its way to ${partnerName}`, 'heart');
  };

  const handlePlant = (species: BonsaiSpeciesId) => {
    feedback.milestone();
    void BonsaiService.plantTree(species, garden.currentIndex + 1);
    toast.show(`A ${BONSAI_SPECIES[species].name.toLowerCase()} seed is in the soil`, 'success', 4000);
  };

  const handleShare = useCallback(() => {
    if (sharing) return;
    feedback.tap();
    setSharing(true);
    window.setTimeout(async () => {
      try {
        const dataUrl = createBonsaiShareCard({
          seed: garden.currentSeed,
          species: garden.currentSpecies,
          growth: tree.growth,
          bloomCount: tree.bloomDays.length,
          decorations: new Set(tree.decorations.map((d) => d.id)),
          golden: tree.mood.golden,
          season,
          stageName: tree.stage.name,
          stageLine: tree.stage.line,
          streak: tree.streak,
          dayCount: treeAge,
          night,
        });
        const shared = await BonsaiShareService.shareCard(
          dataUrl,
          `Day ${treeAge} of our bonsai — ${tree.stage.name}. Grown together on Lior.`,
        );
        if (shared) feedback.confirm();
      } catch {
        toast.show("Couldn't build the share card", 'error');
      } finally {
        setSharing(false);
      }
    }, 30);
  }, [sharing, garden, tree, season, treeAge, night]);

  const myNoteToday = tree.notes.some((n) => !n.forMe && n.day === today);
  const bloomedToday = tree.wateredTodayByMe && tree.wateredTodayByPartner;
  const rainedYesterday = tree.rainDays.length > 0
    && tree.streak > 0
    && daysTogetherFrom(tree.rainDays[tree.rainDays.length - 1], today) <= 2;

  return (
    <div
      className={`bonsai-view bonsai-view--${sky} bonsai-view--${season}`}
      data-golden={tree.mood.golden || undefined}
    >
      <div className="bonsai-sky" aria-hidden="true">
        {night ? (
          <div className="bonsai-stars" />
        ) : (
          <>
            <div className="bonsai-cloud bonsai-cloud--1" />
            <div className="bonsai-cloud bonsai-cloud--2" />
          </>
        )}
        {tree.mood.rain && !reducedMotion && <div className="bonsai-rain" />}
      </div>

      {DEV_AGE_ENABLED && <DevAgePanel onSeed={setEvents} />}

      <ViewHeader
        title="Our Bonsai"
        subtitle={
          partnerHere
            ? `${tree.stage.name} · together now`
            : treeAge > 0
              ? `${tree.stage.name} · day ${treeAge}`
              : tree.stage.name
        }
        variant="transparent"
        borderless
        rightSlot={
          tree.streak > 0 ? (
            <div className="bonsai-chip bonsai-chip--streak" aria-label={`${tree.streak} day streak`}>
              <Flower2 size={13} />
              <span>{tree.streak}</span>
            </div>
          ) : undefined
        }
      />

      <div className="bonsai-stage-area">
        <BonsaiScene
          ref={sceneRef}
          tree={tree}
          seed={garden.currentSeed}
          species={garden.currentSpecies}
          night={night}
          season={season}
          anniversary={anniversary}
          reducedMotion={reducedMotion}
          onNoteTap={(note) => {
            feedback.tap();
            setReadingNote(note);
          }}
          onBloomTap={(day) => {
            feedback.tap();
            setDayOpen(day);
          }}
        />

        <AnimatePresence>
          {stageBanner && (
            <motion.div
              className="bonsai-stage-banner"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles size={15} />
              <div>
                <strong>{stageBanner.name}</strong>
                <p>{stageBanner.line}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {tree.mood.rain && (
          <div className="bonsai-mood-chip">
            <CloudRain size={12} />
            <span>Soft rain today</span>
          </div>
        )}
        {tree.mood.golden && !tree.mood.rain && (
          <div className="bonsai-mood-chip bonsai-mood-chip--gold">
            <Sparkles size={12} />
            <span>A golden-petal day</span>
          </div>
        )}
        {anniversary && (
          <div className="bonsai-mood-chip bonsai-mood-chip--anniversary">
            <Flower2 size={12} />
            <span>Your day — lanterns are up</span>
          </div>
        )}
        <div className="bonsai-scene-fade" aria-hidden="true" />
      </div>

      <div className="bonsai-panel">
        {!tree.planted && (
          <p className="bonsai-panel__intro">
            {!tree.myFirstWaterDone
              ? 'Plant a sakura seed together. It grows one watering at a time — fastest when you both show up.'
              : paired
                ? `Your seed is in the soil. It sprouts when ${partnerName} plants theirs.`
                : 'Your seed is in the soil. Pair with your partner to grow it together.'}
          </p>
        )}

        {tree.resting && (
          <p className="bonsai-panel__resting">
            Your tree missed you. It never dies — water it and it wakes up.
          </p>
        )}
        {rainedYesterday && !tree.resting && (
          <p className="bonsai-panel__rain-note">
            <CloudRain size={12} /> It rained while you were away — your streak held.
          </p>
        )}

        {/* Today's goal — two dewdrops that fill when each of you shows up. */}
        <div className="bonsai-daygoal" role="group" aria-label="Today's watering">
          <div className={`bonsai-drop ${tree.wateredTodayByMe ? 'is-filled' : ''}`}>
            <span className="bonsai-drop__orb">
              {tree.wateredTodayByMe ? <Check size={16} strokeWidth={2.6} /> : <Droplets size={16} />}
            </span>
            <span className="bonsai-drop__name">You</span>
          </div>
          <span className={`bonsai-daygoal__bridge ${bloomedToday ? 'is-complete' : ''}`} aria-hidden="true" />
          {paired ? (
            <div
              className={[
                'bonsai-drop',
                tree.wateredTodayByPartner ? 'is-filled' : '',
                partnerHere ? 'is-here' : '',
              ].join(' ')}
            >
              <span className="bonsai-drop__orb">
                {tree.wateredTodayByPartner ? <Check size={16} strokeWidth={2.6} /> : <Droplets size={16} />}
              </span>
              <span className="bonsai-drop__name">{partnerHere ? `${partnerName} · here` : partnerName}</span>
            </div>
          ) : (
            <button type="button" className="bonsai-drop bonsai-drop--invite" onClick={() => setView('sync')}>
              <span className="bonsai-drop__orb"><UserPlus size={15} /></span>
              <span className="bonsai-drop__name">Invite</span>
            </button>
          )}
        </div>

        {canPlantNext(tree.growth) && (
          <button
            type="button"
            className="bonsai-plant-cta"
            onClick={() => {
              feedback.interact();
              setPickerOpen(true);
            }}
          >
            <Sprout size={16} />
            <span>This tree is Ancient — plant the next one together</span>
          </button>
        )}

        <WaterButton
          watered={tree.wateredTodayByMe}
          planted={tree.myFirstWaterDone}
          reducedMotion={reducedMotion}
          onPourStart={() => sceneRef.current?.startPour()}
          onPourEnd={() => sceneRef.current?.stopPour()}
          onComplete={handleWatered}
        />

        {paired && tree.wateredTodayByMe && !tree.wateredTodayByPartner && !nudgedToday && (
          <button type="button" className="bonsai-nudge-cta" onClick={handleNudge}>
            <Bell size={13} />
            <span>Remind {partnerName} gently</span>
          </button>
        )}

        {tree.wateredTodayByMe && !myNoteToday && (
          <button
            type="button"
            className="bonsai-note-cta"
            onClick={() => {
              feedback.tap();
              setComposeOpen(true);
            }}
          >
            <Feather size={14} />
            <span>Tuck a note into today&apos;s blossom</span>
          </button>
        )}

        {/* Footer — progress toward the next stage + quick actions. */}
        <div className="bonsai-footer">
          <div className="bonsai-progress" aria-label={tree.nextStage ? `Progress to ${tree.nextStage.name}` : 'Ancient'}>
            <div className="bonsai-progress__track">
              <div
                className="bonsai-progress__fill"
                style={{ width: `${Math.round(tree.stageProgress * 100)}%` }}
              />
            </div>
          </div>
          <div className="bonsai-footer__meta">
            <span className="bonsai-progress__hint">
              {tree.nextStage
                ? `${tree.nextStage.at - tree.growth} light to ${tree.nextStage.name}`
                : 'Ancient — an heirloom'}
              {tree.bloomDays.length > 0 ? ` · ${tree.bloomDays.length} blooms` : ''}
            </span>
            <div className="bonsai-panel__actions">
              <button
                type="button"
                className="bonsai-iconbtn bonsai-iconbtn--story"
                onClick={() => {
                  feedback.tap();
                  setStoryOpen(true);
                }}
                aria-label="The story of your tree"
              >
                <BookOpen size={15} />
              </button>
              {(garden.completed.length > 0 || canPlantNext(tree.growth)) && (
                <button
                  type="button"
                  className="bonsai-iconbtn bonsai-iconbtn--grove"
                  onClick={() => {
                    feedback.tap();
                    setGroveOpen(true);
                  }}
                  aria-label="Your grove"
                >
                  <TreePine size={15} />
                </button>
              )}
              {tree.growth > 0 && (
                <button
                  type="button"
                  className="bonsai-iconbtn bonsai-iconbtn--share"
                  onClick={handleShare}
                  disabled={sharing}
                  aria-label="Share your tree"
                >
                  <Share2 size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <BonsaiComposeSheet
        open={composeOpen}
        partnerName={partnerName}
        onClose={() => setComposeOpen(false)}
        onSave={handleSaveNote}
      />
      <BonsaiReadSheet
        note={readingNote}
        partnerName={partnerName}
        onClose={() => setReadingNote(null)}
        onOpened={handleNoteOpened}
      />
      <BonsaiDaySheet
        day={dayOpen}
        tree={tree}
        partnerName={partnerName}
        onClose={() => setDayOpen(null)}
      />
      <BonsaiStorySheet open={storyOpen} tree={tree} onClose={() => setStoryOpen(false)} />
      <BonsaiGroveSheet
        open={groveOpen}
        garden={garden}
        currentGrowth={tree.growth}
        onClose={() => setGroveOpen(false)}
      />
      <BonsaiSpeciesPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePlant}
      />
    </div>
  );
};

export default BonsaiBloom;
