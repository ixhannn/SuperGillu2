import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, CloudRain, Droplets, Feather, Flower2, Sparkles, UserPlus } from 'lucide-react';
import { ViewState } from '../types';
import { BonsaiService } from '../services/bonsai';
import { computeTreeState, daysBetween } from '../utils/bonsai/growth';
import type { BlossomNote, BonsaiEvent } from '../utils/bonsai/types';
import { BonsaiScene, type BonsaiSceneHandle } from '../components/bonsai/BonsaiScene';
import { WaterButton } from '../components/bonsai/WaterButton';
import { BonsaiComposeSheet, BonsaiReadSheet, BonsaiStorySheet } from '../components/bonsai/BonsaiSheets';
import { ViewHeader } from '../components/ViewHeader';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { prefersReducedMotion } from '../utils/motion';
import '../styles/bonsai.css';

interface BonsaiBloomProps {
  setView: (view: ViewState) => void;
}

type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

const skyPhaseFor = (hour: number): SkyPhase => {
  if (hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  if (hour < 20) return 'dusk';
  return 'night';
};

export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
  const seed = useMemo(() => BonsaiService.seed(), []);
  const selfId = useMemo(() => BonsaiService.selfId(), []);
  const partnerName = useMemo(() => BonsaiService.partnerName(), []);
  const paired = useMemo(() => BonsaiService.isPaired(), []);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const [events, setEvents] = useState<BonsaiEvent[]>(() => BonsaiService.getCachedEvents());
  const [today, setToday] = useState(() => BonsaiService.today());
  const [hour, setHour] = useState(() => new Date().getHours());
  const [composeOpen, setComposeOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [readingNote, setReadingNote] = useState<BlossomNote | null>(null);
  const [stageBanner, setStageBanner] = useState<{ name: string; line: string } | null>(null);

  const sceneRef = useRef<BonsaiSceneHandle | null>(null);

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

  const tree = useMemo(
    () => computeTreeState({ events, seed, today, selfId }),
    [events, seed, today, selfId],
  );

  // ── Moment detection (partner watered live, bloom completed, stage up) ──
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

  const handleWatered = () => {
    feedback.confirm();
    if (tree.resting) toast.show('The tree stirs awake — it missed you', 'info');
    void BonsaiService.water();
  };

  const handleSaveNote = (text: string) => {
    feedback.confirm();
    void BonsaiService.setTodayNote(text);
    toast.show(`Sealed until ${partnerName} waters the tree`, 'heart');
  };

  const handleNoteOpened = (note: BlossomNote) => {
    void BonsaiService.markNoteOpened(note.eventId);
  };

  const myNoteToday = tree.notes.some((n) => !n.forMe && n.day === today);
  const sky = skyPhaseFor(hour);
  const night = sky === 'night';
  const firstDay = events.length > 0 ? events.reduce((min, e) => (e.day < min ? e.day : min), events[0].day) : null;
  const treeAge = firstDay ? daysBetween(firstDay, today) + 1 : 0;

  const partnerChip = paired ? (
    <div className={`bonsai-chip ${tree.wateredTodayByPartner ? 'bonsai-chip--on' : ''}`}>
      <Droplets size={13} />
      <span>{partnerName}</span>
    </div>
  ) : (
    <button type="button" className="bonsai-chip bonsai-chip--invite" onClick={() => setView('sync')}>
      <UserPlus size={13} />
      <span>Invite {partnerName === 'Your partner' ? 'your partner' : partnerName}</span>
    </button>
  );

  return (
    <div className={`bonsai-view bonsai-view--${sky}`} data-golden={tree.mood.golden || undefined}>
      <div className="bonsai-sky" aria-hidden="true">
        {tree.mood.rain && !reducedMotion && <div className="bonsai-rain" />}
      </div>

      <ViewHeader
        title="Our Bonsai"
        subtitle={tree.stage.name}
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
          seed={seed}
          night={night}
          reducedMotion={reducedMotion}
          onNoteTap={(note) => {
            feedback.tap();
            setReadingNote(note);
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
        </div>

        <WaterButton
          watered={tree.wateredTodayByMe}
          planted={tree.myFirstWaterDone}
          reducedMotion={reducedMotion}
          onPourStart={() => sceneRef.current?.startPour()}
          onPourEnd={() => sceneRef.current?.stopPour()}
          onComplete={handleWatered}
        />

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
      <BonsaiStorySheet open={storyOpen} tree={tree} onClose={() => setStoryOpen(false)} />
    </div>
  );
};

export default BonsaiBloom;
