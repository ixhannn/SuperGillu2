import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { CoupleProfile } from '../types';
import { StorageService } from '../services/storage';

interface MutualStreakProps {
    profile: CoupleProfile;
    onCheckIn: () => void;
}

// Flickering flame made from layered blurred divs
const Flame: React.FC<{ count: number }> = ({ count }) => {
    const intensity = Math.min(count / 30, 1); // scales 0→1 over 30 days
    const size = 18 + intensity * 10; // 18px → 28px

    return (
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
            {/* Outer glow */}
            <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full blur-sm"
                style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.6) 0%, transparent 70%)' }}
            />
            {/* Core flame body */}
            <motion.div
                animate={{ scaleY: [1, 1.15, 0.95, 1.1, 1], scaleX: [1, 0.9, 1.05, 0.95, 1] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute rounded-full"
                style={{
                    width: '55%', height: '70%',
                    bottom: '5%',
                    background: 'linear-gradient(180deg, #fbbf24 0%, #f97316 50%, #ef4444 100%)',
                    filter: 'blur(1px)',
                    transformOrigin: 'bottom center',
                }}
            />
            {/* Inner bright core */}
            <motion.div
                animate={{ scaleY: [1, 1.2, 0.9, 1], opacity: [0.9, 1, 0.8, 0.9] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
                className="absolute rounded-full"
                style={{
                    width: '30%', height: '45%',
                    bottom: '10%',
                    background: 'linear-gradient(180deg, #fef08a 0%, #fbbf24 100%)',
                    filter: 'blur(0.5px)',
                    transformOrigin: 'bottom center',
                }}
            />
            {/* Tip flicker */}
            <motion.div
                animate={{ scaleY: [1, 1.4, 0.7, 1.2, 1], x: [0, 1, -1, 0.5, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                className="absolute rounded-full"
                style={{
                    width: '18%', height: '35%',
                    top: '5%',
                    background: 'rgba(254,240,138,0.9)',
                    filter: 'blur(0.5px)',
                    transformOrigin: 'bottom center',
                }}
            />
        </div>
    );
};

// Broken flame — grey, cracked look
const BrokenFlame: React.FC = () => (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18 }}>
        <motion.div
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(156,163,175,0.4) 0%, transparent 70%)' }}
        />
        <div className="absolute rounded-full" style={{
            width: '55%', height: '65%', bottom: '5%',
            background: 'linear-gradient(180deg, #d1d5db 0%, #9ca3af 100%)',
            filter: 'blur(1px)',
        }} />
        <div className="absolute rounded-full" style={{
            width: '28%', height: '40%', bottom: '10%',
            background: '#e5e7eb',
            filter: 'blur(0.5px)',
        }} />
    </div>
);

export const MutualStreak: React.FC<MutualStreakProps> = ({ profile, onCheckIn }) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Auto check-in on mount
    useEffect(() => {
        const prof = StorageService.getCoupleProfile();
        const sd = prof.streakData;
        const alreadyCheckedIn = sd?.checkIns?.[prof.myName] === today;
        if (!alreadyCheckedIn) {
            StorageService.checkInStreak();
            onCheckIn();
        }
    }, []);

    const streakData = profile.streakData ?? { checkIns: {}, count: 0, lastMutualDate: '', bestStreak: 0 };
    const myCheckedIn = streakData.checkIns[profile.myName] === today;
    const partnerCheckedIn = streakData.checkIns[profile.partnerName] === today;
    const bothToday = myCheckedIn && partnerCheckedIn;
    const count = streakData.count;
    const best = streakData.bestStreak ?? 0;

    // Streak is broken if last mutual was not today or yesterday, and there was a streak
    const wasActive = streakData.lastBrokenDate === today && (streakData.lastBrokenCount ?? 0) > 0;
    const isStreakBroken = !bothToday
        && streakData.lastMutualDate !== today
        && streakData.lastMutualDate !== yesterday
        && count > 0;

    return (
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-500"
            style={{
                background: bothToday
                    ? 'linear-gradient(90deg, rgba(251,146,60,0.18), rgba(239,68,68,0.12))'
                    : isStreakBroken
                    ? 'rgba(0,0,0,0.06)'
                    : 'rgba(0,0,0,0.06)',
                border: bothToday
                    ? '1.5px solid rgba(251,146,60,0.4)'
                    : isStreakBroken
                    ? '1.5px solid rgba(0,0,0,0.09)'
                    : '1.5px solid rgba(0,0,0,0.09)',
                boxShadow: bothToday ? '0 2px 14px rgba(251,146,60,0.22)' : 'none',
            }}>

            {/* My avatar */}
            <Avatar name={profile.myName} checked={myCheckedIn} color="#ec4899" />

            {/* Center content */}
            <div className="flex items-center gap-1.5">
                <AnimatePresence mode="wait">
                    {bothToday ? (
                        <motion.div key="active" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-1.5">
                            <Flame count={count} />
                            <div className="flex flex-col leading-none gap-0.5">
                                <span className="text-[0.78rem] font-bold leading-none" style={{ color: '#c2410c' }}>
                                    {count === 1 ? 'Day 1 🎉' : `${count} days`}
                                </span>
                                {best >= count && best > 1 && (
                                    <span className="text-[0.62rem] font-medium leading-none" style={{ color: '#f97316' }}>
                                        best {best}d
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    ) : isStreakBroken ? (
                        <motion.div key="broken" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                            <BrokenFlame />
                            <div className="flex flex-col leading-none gap-0.5">
                                <span className="text-[0.75rem] font-semibold leading-none text-gray-600">streak ended</span>
                                {(streakData.lastBrokenCount ?? 0) > 0 && (
                                    <span className="text-[0.62rem] font-medium leading-none text-gray-400">
                                        was {streakData.lastBrokenCount} days
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    ) : myCheckedIn ? (
                        <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                            <div className="flex gap-[3px] items-center">
                                {[0, 1, 2].map(i => (
                                    <motion.div key={i}
                                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ background: '#fb923c' }}
                                    />
                                ))}
                            </div>
                            <span className="text-[0.75rem] font-medium text-gray-600 whitespace-nowrap">
                                waiting for {profile.partnerName}
                            </span>
                        </motion.div>
                    ) : (
                        <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                            {count > 0 ? (
                                <>
                                    <Flame count={count} />
                                    <span className="text-[0.75rem] font-medium text-gray-600 whitespace-nowrap">
                                        {count}d · opening app…
                                    </span>
                                </>
                            ) : (
                                <span className="text-[0.75rem] font-medium text-gray-600 whitespace-nowrap">
                                    start your streak
                                </span>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Partner avatar */}
            <Avatar name={profile.partnerName} checked={partnerCheckedIn} color="#6366f1" />
        </div>
    );
};

const Avatar: React.FC<{ name: string; checked: boolean; color: string }> = ({ name, checked, color }) => (
    <motion.div
        animate={checked ? { scale: [1, 1.18, 1] } : {}}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
        style={{
            background: checked ? color : 'rgba(0,0,0,0.09)',
            boxShadow: checked ? `0 0 0 2px ${color}40, 0 2px 8px ${color}35` : 'none',
        }}
    >
        <AnimatePresence mode="wait">
            {checked ? (
                <motion.div key="check"
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 20 }}>
                    <Check size={11} className="text-white" strokeWidth={3} />
                </motion.div>
            ) : (
                <motion.span key="initial" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-[0.65rem] font-bold leading-none select-none"
                    style={{ color: 'rgba(0,0,0,0.4)' }}>
                    {name[0]}
                </motion.span>
            )}
        </AnimatePresence>
    </motion.div>
);
