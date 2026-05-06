import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { LoveLanguageProfile, LoveLanguageType } from '../types';

const LANGUAGE_LABELS: Record<LoveLanguageType, { label: string; color: string }> = {
  words_of_affirmation: { label: 'Words of Affirmation', color: '#f472b6' },
  quality_time: { label: 'Quality Time', color: '#60a5fa' },
  acts_of_service: { label: 'Acts of Service', color: '#fbbf24' },
  physical_touch: { label: 'Physical Touch', color: '#34d399' },
  gifts: { label: 'Gifts', color: '#a78bfa' },
};

interface LoveLanguagePieProps {
  profile: LoveLanguageProfile | null;
  name: string;
}

export const LoveLanguagePie: React.FC<LoveLanguagePieProps> = ({ profile, name }) => {
  if (!profile) return null;
  const data = Object.entries(profile.scores).map(([key, value]) => ({
    name: LANGUAGE_LABELS[key as LoveLanguageType].label,
    value: Math.round(value * 100),
    color: LANGUAGE_LABELS[key as LoveLanguageType].color,
  }));

  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(var(--theme-particle-1-rgb), 0.04)', border: '1px solid rgba(var(--theme-particle-1-rgb), 0.08)' }}>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
        {name}'s Love Language Profile
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={70}
            label={({ name, percent }) => `${name} (${Math.round(percent * 100)}%)`}
          >
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
