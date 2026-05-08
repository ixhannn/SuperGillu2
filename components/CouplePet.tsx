import React from 'react';

const LazyCocoPetOverlay = React.lazy(() =>
  import('./coco-pet/CocoPetOverlay').then((module) => ({ default: module.CocoPetOverlay })),
);

interface CouplePetProps {
  onClose?: () => void;
  memories?: unknown;
  notes?: unknown;
  status?: unknown;
  partnerName?: string;
}

export const CouplePet: React.FC<CouplePetProps> = ({ onClose }) => (
  <React.Suspense fallback={null}>
    <LazyCocoPetOverlay onClose={onClose} />
  </React.Suspense>
);
