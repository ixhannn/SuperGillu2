import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DailyVideoClip } from '../../types';
import { VideoMomentsService } from '../../services/videoMoments';

interface RecapFilmStripProps {
  clips: DailyVideoClip[];
}

export function RecapFilmStrip({ clips }: RecapFilmStripProps) {
  if (clips.length === 0) return null;
  return (
    <section className="recap-film">
      <h2 className="recap-film__title">This week, on film</h2>
      <div className="recap-film__strip">
        {clips.slice(0, 14).map((clip, i) => (
          <FilmFrame key={clip.id} clip={clip} index={i} />
        ))}
      </div>
    </section>
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
      className="recap-film__frame"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.03 }}
    >
      {thumb ? (
        <img src={thumb} alt="" />
      ) : (
        <div className="recap-film__frame-empty" />
      )}
    </motion.div>
  );
}
