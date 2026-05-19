import React from 'react';
import { CocoPetOverlay } from '../components/coco-pet/CocoPetOverlay';
import type { ViewState } from '../types';

interface CocoPetPageProps {
  setView: (view: ViewState) => void;
}

export const CocoPetPage: React.FC<CocoPetPageProps> = ({ setView }) => (
  <CocoPetOverlay onClose={() => setView('home')} mode="page" />
);
