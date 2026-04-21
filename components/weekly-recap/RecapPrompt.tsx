import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Sparkles, Send } from 'lucide-react';

interface RecapPromptProps {
  text: string;
  promptType: 'shared_mood' | 'gap' | 'milestone' | 'general';
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  shared_mood: <Sparkles size={16} />,
  gap: <MessageCircle size={16} />,
  milestone: <Sparkles size={16} />,
  general: <MessageCircle size={16} />,
};

const TYPE_LABELS: Record<string, string> = {
  shared_mood: 'Shared moment',
  gap: 'Check in',
  milestone: 'Milestone',
  general: 'For you both',
};

export function RecapPrompt({ text, promptType }: RecapPromptProps) {
  const [reply, setReply] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!reply.trim()) return;
    setSubmitted(true);
    // Future: save reply as a Note via StorageService
  };

  return (
    <motion.section
      className="recap-prompt"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="recap-prompt__badge">
        {TYPE_ICONS[promptType]}
        <span>{TYPE_LABELS[promptType]}</span>
      </div>

      <h3 className="recap-prompt__heading">Our Prompt</h3>

      <motion.blockquote
        className="recap-prompt__text"
        initial={{ opacity: 0, x: -8 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        "{text}"
      </motion.blockquote>

      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="input"
            className="recap-prompt__reply"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <input
              type="text"
              className="recap-prompt__input"
              placeholder="Quick thought…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <motion.button
              className="recap-prompt__send"
              whileTap={{ scale: 0.9 }}
              onClick={handleSubmit}
              disabled={!reply.trim()}
            >
              <Send size={14} />
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="thanks"
            className="recap-prompt__thanks"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Sparkles size={16} />
            <span>Saved ✨</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
