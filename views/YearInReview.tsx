import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Crown,
  Heart,
  Mail,
  Mic,
  Share2,
  Sparkles,
  Video,
} from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { PremiumModal } from '../components/PremiumModal';
import { feedback } from '../utils/feedback';
import { StorageService } from '../services/storage';
import { computeYearStats, getAvailableReviewYears, type YearStats } from '../services/yearInReview';
import { ViewState } from '../types';

interface YearInReviewViewProps {
  setView: (view: ViewState) => void;
}

const PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  backdropFilter: 'blur(22px)',
};

const GOLD_TEXT = '#f3d6a4';

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-[1.6rem] p-4" style={PANEL_STYLE}>
    <div className="mb-4 flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">{label}</span>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-white/80">
        {icon}
      </div>
    </div>
    <p className="text-[1.9rem] font-semibold leading-none text-white">{value}</p>
    <p className="mt-3 text-[0.82rem] leading-relaxed text-white/58">{hint}</p>
  </div>
);

const YearStepper: React.FC<{
  years: number[];
  currentYear: number;
  onChange: (year: number) => void;
}> = ({ years, currentYear, onChange }) => {
  const index = years.indexOf(currentYear);
  const previousYear = index < years.length - 1 ? years[index + 1] : null;
  const nextYear = index > 0 ? years[index - 1] : null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-2 py-1.5">
      <button
        type="button"
        onClick={() => previousYear && onChange(previousYear)}
        disabled={!previousYear}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white transition-opacity disabled:opacity-25"
        aria-label="Previous year"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="min-w-[88px] px-1 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">Review</p>
        <p className="font-serif text-[1rem] text-white">{currentYear}</p>
      </div>
      <button
        type="button"
        onClick={() => nextYear && onChange(nextYear)}
        disabled={!nextYear}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white transition-opacity disabled:opacity-25"
        aria-label="Next year"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">
    <Sparkles size={12} />
    {children}
  </div>
);

const shareReview = async (stats: YearStats) => {
  const text = [
    `${stats.year} in Review`,
    `${stats.myName} and ${stats.partnerName}`,
    '',
    `${stats.totalMemories} memories kept`,
    `${stats.activeDays} active days`,
    `${stats.favoriteFormat.count} ${stats.favoriteFormat.label.toLowerCase()}`,
    '',
    'Made with love in Lior',
  ].join('\n');

  try {
    if (navigator.share) {
      await navigator.share({ title: `${stats.year} in Review`, text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    feedback.celebrate();
  } catch {
    // Ignore cancelled shares.
  }
};

export const YearInReviewView: React.FC<YearInReviewViewProps> = ({ setView }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const years = useMemo(() => getAvailableReviewYears(), []);
  const [selectedYear, setSelectedYear] = useState(years[0] ?? new Date().getFullYear());

  const profile = StorageService.getCoupleProfile();
  const isPremiumUser = !!profile.isPremium;
  const stats = useMemo(
    () => (isPremiumUser ? computeYearStats(selectedYear) : null),
    [isPremiumUser, selectedYear],
  );

  if (!isPremiumUser) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen flex-col">
        <ViewHeader title="Year in Review" onBack={() => setView('home')} variant="centered" />

        <div className="view-container pb-28">
          <div
            className="overflow-hidden rounded-[2rem] border border-white/60"
            style={{
              background: 'linear-gradient(145deg, rgba(31,17,26,0.97) 0%, rgba(83,45,58,0.92) 52%, rgba(141,95,68,0.88) 100%)',
              boxShadow: '0 18px 48px rgba(42,18,26,0.2)',
            }}
          >
            <div className="p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">
                <Crown size={12} />
                Premium annual edit
              </div>

              <h2 className="mt-5 font-serif text-[2rem] leading-[1.02] text-white">
                Your story,
                <br />
                finally told properly
              </h2>
              <p className="mt-4 max-w-[28rem] text-[14px] leading-6 text-white/72">
                This premium recap now focuses on the selected year, real activity, standout days, and the rituals that actually mattered.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  'Switch between years instead of seeing one vague all-time dump.',
                  'See moods, rituals, milestone counts, and archive days scoped to the right year.',
                  'Get a richer, more premium story even when your data is still sparse.',
                ].map((item) => (
                  <div key={item} className="rounded-[1.35rem] border border-white/12 bg-black/12 px-4 py-3 text-[13px] leading-relaxed text-white/72">
                    {item}
                  </div>
                ))}
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="mt-7 w-full rounded-full px-5 py-4 text-sm font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, #8e5863 0%, #c48d61 100%)',
                  boxShadow: '0 10px 28px rgba(142,88,99,0.26)',
                }}
              >
                Unlock Year in Review
              </motion.button>
            </div>
          </div>
        </div>

        <PremiumModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </motion.div>
    );
  }

  if (!stats) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen flex-col">
      <ViewHeader
        title="Year in Review"
        subtitle={stats.year.toString()}
        onBack={() => setView('home')}
        variant="centered"
        rightSlot={
          <button
            type="button"
            onClick={() => shareReview(stats)}
            className="vh-back"
            aria-label="Share Year in Review"
          >
            <Share2 size={17} strokeWidth={2.4} />
          </button>
        }
      />

      <div className="view-container pb-28">
        <div
          className="overflow-hidden rounded-[2.4rem] border border-white/60"
          style={{
            background: 'linear-gradient(150deg, rgba(21,14,20,0.98) 0%, rgba(52,30,41,0.96) 40%, rgba(93,56,48,0.92) 100%)',
            boxShadow: '0 24px 56px rgba(33,16,20,0.2)',
          }}
        >
          <div className="relative overflow-hidden p-6">
            <div className="absolute -right-16 -top-12 h-48 w-48 rounded-full bg-amber-200/10 blur-3xl" />
            <div className="absolute -left-12 bottom-0 h-56 w-56 rounded-full bg-rose-300/10 blur-3xl" />

            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: GOLD_TEXT }}>
                    <Sparkles size={12} />
                    Premium annual edit
                  </div>
                  <h2 className="mt-4 max-w-[12ch] font-serif text-[2.15rem] leading-[0.98] text-white">
                    {stats.myName} and {stats.partnerName}
                  </h2>
                  <p className="mt-3 max-w-[34rem] text-[0.95rem] leading-relaxed text-white/72">
                    {stats.summary}
                  </p>
                </div>
                <YearStepper
                  years={years}
                  currentYear={selectedYear}
                  onChange={(year) => {
                    setSelectedYear(year);
                    feedback.tap();
                  }}
                />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                <StatTile
                  icon={<Camera size={18} />}
                  label="Memories"
                  value={stats.totalMemories.toLocaleString()}
                  hint={`${stats.memoriesWithPhotos} with photos and ${stats.memoriesWithVideos} with video.`}
                />
                <StatTile
                  icon={<Calendar size={18} />}
                  label="Active days"
                  value={stats.activeDays.toLocaleString()}
                  hint={`${stats.capturedMonths} months of timestamped activity made it into the archive.`}
                />
                <StatTile
                  icon={<Heart size={18} />}
                  label="Longest run"
                  value={`${stats.activityStreak} days`}
                  hint="The longest streak of showing up across memories, notes, daily moments, keepsakes, or voice notes."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] p-5" style={PANEL_STYLE}>
            <SectionLabel>Month highlights</SectionLabel>
            <div className="space-y-3">
              {stats.monthHighlights.length > 0 ? stats.monthHighlights.map((item) => (
                <div key={item.month}>
                  <div className="mb-2 flex items-center justify-between text-sm text-white">
                    <span className="font-medium">{item.month}</span>
                    <span className="text-white/58">{item.count} moments</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(item.share, 8)}%`,
                        background: 'linear-gradient(90deg, rgba(244,214,164,0.95), rgba(255,255,255,0.88))',
                      }}
                    />
                  </div>
                </div>
              )) : (
                <p className="rounded-[1.35rem] bg-white/6 px-4 py-4 text-[0.88rem] leading-relaxed text-white/58">
                  No month has enough signal yet. Keep using memories, notes, daily moments, and voice notes consistently to turn next year into a stronger annual story.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] p-5" style={PANEL_STYLE}>
            <SectionLabel>What carried the year</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.35rem] bg-white/6 px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">Favorite format</p>
                <p className="mt-2 text-[1.1rem] font-medium text-white">{stats.favoriteFormat.label}</p>
                <p className="mt-2 text-[0.82rem] leading-relaxed text-white/58">{stats.favoriteFormat.description}</p>
              </div>
              <div className="rounded-[1.35rem] bg-white/6 px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">Most active month</p>
                <p className="mt-2 text-[1.1rem] font-medium text-white">
                  {stats.mostActiveMonth.count > 0 ? `${stats.mostActiveMonth.name} (${stats.mostActiveMonth.count})` : 'Still building'}
                </p>
                <p className="mt-2 text-[0.82rem] leading-relaxed text-white/58">
                  {stats.narrative}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[2rem] p-5" style={PANEL_STYLE}>
            <SectionLabel>Moods and language</SectionLabel>
            <div className="space-y-4">
              {stats.topMoods.length > 0 ? stats.topMoods.map((item) => (
                <div key={item.mood}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-[0.98rem] font-medium text-white">{item.emoji}</p>
                      <p className="text-[0.8rem] uppercase tracking-[0.2em] text-white/48">{item.mood}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[1rem] font-medium text-white">{item.count}</p>
                      <p className="text-[0.76rem] text-white/52">{item.share}% of memories</p>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(item.share, 8)}%`, background: 'linear-gradient(90deg, rgba(243,214,164,0.95), rgba(255,255,255,0.88))' }}
                    />
                  </div>
                </div>
              )) : (
                <p className="rounded-[1.35rem] bg-white/6 px-4 py-4 text-[0.88rem] leading-relaxed text-white/58">
                  There were not enough mood-tagged memories to build a proper emotional map yet.
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {stats.topWords.length > 0 ? stats.topWords.map((word, index) => (
                <div
                  key={word.word}
                  className="rounded-full px-4 py-2"
                  style={{
                    background: index === 0 ? 'rgba(243,214,164,0.18)' : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${index === 0 ? 'rgba(243,214,164,0.22)' : 'rgba(255,255,255,0.08)'}`,
                    color: index === 0 ? GOLD_TEXT : '#ffffff',
                  }}
                >
                  <span className="text-sm font-medium">{word.word}</span>
                  <span className="ml-2 text-xs opacity-70">{word.count}</span>
                </div>
              )) : (
                <p className="rounded-[1.35rem] bg-white/6 px-4 py-4 text-[0.88rem] leading-relaxed text-white/58">
                  More written memories and notes will turn this into a signature chapter instead of an empty placeholder.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] p-5" style={PANEL_STYLE}>
            <SectionLabel>Rituals that mattered</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                icon={<Camera size={17} />}
                label="Daily moments"
                value={(stats.totalDailyPhotos + stats.totalDailyVideos).toLocaleString()}
                hint={`${stats.totalDailyPhotos} photo drops and ${stats.totalDailyVideos} video drops.`}
              />
              <StatTile
                icon={<Mail size={17} />}
                label="Notes and letters"
                value={(stats.totalNotes + stats.openedLetters).toLocaleString()}
                hint={`${stats.totalNotes} notes and ${stats.openedLetters} letters opened during the year.`}
              />
              <StatTile
                icon={<Mic size={17} />}
                label="Voice"
                value={stats.totalVoiceNotes.toLocaleString()}
                hint={`${Math.round(stats.totalVoiceSeconds / 60)} minutes of voice were kept.`}
              />
              <StatTile
                icon={<Video size={17} />}
                label="Keepsakes"
                value={stats.totalKeepsakes.toLocaleString()}
                hint={`${stats.totalMilestones} milestone dates remained part of the relationship map.`}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] p-5" style={PANEL_STYLE}>
            <SectionLabel>Standout days</SectionLabel>
            <div className="space-y-3">
              {stats.standoutDays.length > 0 ? stats.standoutDays.map((item) => (
                <div key={item.date} className="rounded-[1.35rem] bg-white/6 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[1rem] font-medium text-white">{item.title}</p>
                      <p className="text-[0.78rem] uppercase tracking-[0.2em] text-white/44">{item.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[1.4rem] font-semibold text-white">{item.count}</p>
                      <p className="text-[0.76rem] text-white/52">entries</p>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="rounded-[1.35rem] bg-white/6 px-4 py-4 text-[0.88rem] leading-relaxed text-white/58">
                  No single day rose above the rest yet. Once the archive gets denser, this section will surface the specific days worth replaying.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] p-5" style={PANEL_STYLE}>
            <SectionLabel>Closing note</SectionLabel>
            <p className="max-w-[36rem] font-serif text-[1.4rem] leading-[1.28] text-white">
              {stats.totalActivities === 0
                ? 'This feature is now ready to feel premium. It just needs enough story to carry the weight.'
                : `${stats.myName} and ${stats.partnerName} did not just log data in ${stats.year}. They built a record worth replaying.`}
            </p>
            <p className="mt-4 max-w-[38rem] text-[0.95rem] leading-relaxed text-white/64">
              {stats.narrative}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {[
                { label: 'Days together', value: `${stats.daysTogether.toLocaleString()} days` },
                { label: 'Favorite format', value: stats.favoriteFormat.label },
                { label: 'Archive days', value: `${stats.activeDays}` },
              ].map((item) => (
                <div key={item.label} className="rounded-full bg-white/8 px-4 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/44">{item.label}</span>
                  <span className="ml-2 text-sm text-white">{item.value}</span>
                </div>
              ))}
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => shareReview(stats)}
              className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-black"
              style={{ background: GOLD_TEXT }}
            >
              <Share2 size={16} />
              Share this recap
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
