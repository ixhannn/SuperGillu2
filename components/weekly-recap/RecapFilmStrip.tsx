import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { DailyVideoClip } from '../../types';
import { VideoMomentsService } from '../../services/videoMoments';
import { GOLD, GOLD_SOFT_SPRING, GoldSectionHeader, goldRise } from '../premium/GoldKit';

interface RecapFilmStripProps {
    clips: DailyVideoClip[];
}

/** On film — the week's daily clips as a sprocketed contact sheet. */
export function RecapFilmStrip({ clips }: RecapFilmStripProps) {
    if (clips.length === 0) return null;
    return (
        <motion.section
            className="grc-film"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
        >
            <GoldSectionHeader label="On film" className="mt-10 mb-3" />
            <div className="rounded-[1.6rem] px-4 pt-4 pb-3" style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}>
                <h2 className="font-serif text-[1.2rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                    This week, on film
                </h2>
                <div className="grc-film__strip mt-2">
                    {clips.slice(0, 14).map((clip, i) => (
                        <FilmFrame key={clip.id} clip={clip} index={i} />
                    ))}
                </div>
            </div>
        </motion.section>
    );
}

function FilmFrame({ clip, index }: { clip: DailyVideoClip; index: number }) {
    const [thumb, setThumb] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let created: string | null = null;
        VideoMomentsService.getThumbnailUrl(clip).then((url) => {
            if (cancelled) {
                if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
                return;
            }
            created = url;
            setThumb(url);
        });
        return () => {
            cancelled = true;
            if (created && created.startsWith('blob:')) URL.revokeObjectURL(created);
        };
    }, [clip.id, clip.thumbnailId]);

    return (
        <motion.div
            className="grc-film__frame"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...GOLD_SOFT_SPRING, delay: index * 0.03 }}
        >
            {thumb ? (
                <img src={thumb} alt="" />
            ) : (
                <div className="grc-film__frame-empty" />
            )}
        </motion.div>
    );
}
