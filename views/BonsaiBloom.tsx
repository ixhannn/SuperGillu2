import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BookOpen, CloudRain, Droplets, Feather, Flower2, Share2, Sparkles, Sprout, TreePine, UserPlus } from 'lucide-react';
import { ViewState } from '../types';
import { BonsaiService } from '../services/bonsai';
import { BonsaiShareService } from '../services/bonsaiShare';
import { NotificationsService } from '../services/notifications';
import { StorageService } from '../services/storage';
import { syncEventTarget } from '../services/sync';
import { canPlantNext, computeGarden, computeTreeState, daysBetween, seasonFor } from '../utils/bonsai/growth';
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

type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

const SEEN_GROWTH_KEY = 'lior_bonsai_seen_v1';

const skyPhaseFor = (hour: number): SkyPhase => {
  if (hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  if (hour < 20) return 'dusk';
  return 'night';
};

const readSeenGrowth = (coupleKey: string): number | null => {
  try {
    const raw = localStorage.getItem(SEEN_GROWTH_KEY);
    const parsed = raw ? (JSON.parse(raw) as { coupleKey: string; growth: number }) : null;
    return parsed && parsed.coupleKey === coupleKey ? parsed.growth : null;
  } catch {
    return null;
  }
};

const writeSeenGrowth = (coupleKey: string, growth: number): void => {
  try {
    localStorage.setItem(SEEN_GROWTH_KEY, JSON.stringify({ coupleKey, growth }));
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
  useEffect(() => {
    if (timelapseDoneRef.current || tree.growth === 0) return;
    timelapseDoneRef.current = true;
    const seen = readSeenGrowth(BonsaiService.coupleKey());
    if (seen != null && tree.growth - seen >= 3) {
      window.setTimeout(() => sceneRef.current?.timelapse(seen), 450);
    }
  }, [tree.growth]);
  useEffect(() => {
    if (tree.growth > 0) writeSeenGrowth(BonsaiService.coupleKey(), tree.growth);
  }, [tree.growth]);

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
  const treeAge = firstDay ? daysBetween(firstDay, today) + 1 : 0;
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
  const rainedYesterday = tree.rainDays.length > 0
    && tree.streak > 0
    && daysBetween(tree.rainDays[tree.rainDays.length - 1], today) <= 2;

  const partnerChip = paired ? (
    <div
      className={[
        'bonsai-chip',
        tree.wateredTodayByPartner ? 'bonsai-chip--on' : '',
        partnerHere ? 'bonsai-chip--here' : '',
      ].join(' ')}
    >
      <Droplets size={13} />
      <span>{partnerName}</span>
      {partnerHere && <span className="bonsai-chip__dot" aria-label="here right now" />}
    </div>
  ) : (
    <button type="button" className="bonsai-chip bonsai-chip--invite" onClick={() => setView('sync')}>
      <UserPlus size={13} />
      <span>Invite {partnerName === 'Your partner' ? 'your partner' : partnerName}</span>
    </button>
  );

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

      <ViewHeader
        title="Our Bonsai"
        subtitle={partnerHere ? `${tree.stage.name} · together now` : tree.stage.name}
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

        <div className="bonsai-panel__chips">
          <div className={`bonsai-chip ${tree.wateredTodayByMe ? 'bonsai-chip--on' : ''}`}>
            <Droplets size={13} />
            <span>You</span>
          </div>
          {partnerChip}
          {treeAge > 0 && (
            <div className="bonsai-chip bonsai-chip--quiet">
              <span>Day {treeAge}</span>
            </div>
          )}
          <button
            type="button"
            className="bonsai-chip bonsai-chip--quiet"
            onClick={() => {
              feedback.tap();
              setStoryOpen(true);
            }}
          >
            <BookOpen size={13} />
            <span>Story</span>
          </button>
          {(garden.completed.length > 0 || canPlantNext(tree.growth)) && (
            <button
              type="button"
              className="bonsai-chip bonsai-chip--quiet"
              onClick={() => {
                feedback.tap();
                setGroveOpen(true);
              }}
            >
              <TreePine size={13} />
              <span>Grove</span>
            </button>
          )}
          {tree.growth > 0 && (
            <button
              type="button"
              className="bonsai-chip bonsai-chip--quiet"
              onClick={handleShare}
              disabled={sharing}
              aria-label="Share your tree"
            >
              <Share2 size={13} />
              <span>{sharing ? '…' : 'Share'}</span>
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

        {tree.nextStage && (
          <div className="bonsai-progress" aria-label={`Progress to ${tree.nextStage.name}`}>
            <div className="bonsai-progress__track">
              <div
                className="bonsai-progress__fill"
                style={{ width: `${Math.round(tree.stageProgress * 100)}%` }}
              />
            </div>
            <span className="bonsai-progress__hint">
              {tree.nextStage.at - tree.growth} light to {tree.nextStage.name}
              {tree.bloomDays.length > 0 ? ` · ${tree.bloomDays.length} blooms` : ''}
            </span>
          </div>
        )}
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
