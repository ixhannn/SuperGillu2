import React from 'react';
import type { RelationshipModel } from '../../types';
import { ClosenessTrajectoryViz } from '../ClosenessTrajectory';
import { LoveLanguageProfileViz } from '../LoveLanguageProfile';
import { LoveLanguagePie } from '../LoveLanguagePie';

interface PartnerIntelligenceVisualsProps {
  model: RelationshipModel | null;
  myName: string;
  partnerName: string;
}

export const PartnerIntelligenceVisuals: React.FC<PartnerIntelligenceVisualsProps> = ({
  model,
  myName,
  partnerName,
}) => {
  if (!model) return null;

  return (
    <>
      <ClosenessTrajectoryViz model={model} />
      {model.partners.length >= 2 && (
        <>
          <LoveLanguageProfileViz
            myProfile={model.partners[0]?.loveLanguage}
            partnerProfile={model.partners[1]?.loveLanguage}
            myName={myName}
            partnerName={partnerName}
          />
          <LoveLanguagePie
            profile={model.partners[0]?.loveLanguage}
            name={myName}
          />
          <LoveLanguagePie
            profile={model.partners[1]?.loveLanguage}
            name={partnerName}
          />
        </>
      )}
    </>
  );
};
