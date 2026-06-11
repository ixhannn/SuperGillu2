import React from 'react';
import type { RelationshipModel } from '../../types';
import { ClosenessTrajectoryViz } from '../ClosenessTrajectory';
import { LoveLanguageProfileViz } from '../LoveLanguageProfile';
import { LoveLanguagePie } from '../LoveLanguagePie';
import { GoldSectionHeader } from '../premium/GoldKit';
import '../../styles/gold-partner-intelligence.css';

interface PartnerIntelligenceVisualsProps {
    model: RelationshipModel | null;
    myName: string;
    partnerName: string;
}

/**
 * Lazy half of the Love Tracker observatory: the closeness instrument and
 * the love-language atlas. The shared visual components rendered here
 * (ClosenessTrajectoryViz, LoveLanguageProfileViz, LoveLanguagePie) are
 * used elsewhere in the app and are NOT edited — they are re-skinned for
 * the dark gold stage purely by the `gpi-retheme` wrapper, which
 * re-declares the theme variables they paint with.
 */
export const PartnerIntelligenceVisuals: React.FC<PartnerIntelligenceVisualsProps> = ({
    model,
    myName,
    partnerName,
}) => {
    if (!model) return null;

    return (
        <>
            {/* Closeness — instrument panel around the shared trajectory viz */}
            <div className="gpi-retheme gpi-panel p-2.5">
                <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2">
                    <span
                        className="text-[9px] font-bold uppercase tracking-[0.24em]"
                        style={{ color: 'rgba(246,199,104,0.65)' }}
                    >
                        Instrument · Closeness
                    </span>
                    <div className="gpi-ticks flex-1" aria-hidden="true" />
                </div>
                <ClosenessTrajectoryViz model={model} />
            </div>

            {model.partners.length >= 2 && (
                <>
                    {/* Label intentionally avoids the exact phrase "Love languages":
                        the Playwright heavy-view test locates the inner shared
                        component by that text and strict mode forbids duplicates. */}
                    <GoldSectionHeader label="Languages of love" className="mt-4 mb-0.5" />
                    <div className="lp-foil">
                        <div className="gpi-retheme gpi-frame">
                            <LoveLanguageProfileViz
                                myProfile={model.partners[0]?.loveLanguage}
                                partnerProfile={model.partners[1]?.loveLanguage}
                                myName={myName}
                                partnerName={partnerName}
                            />
                            <div className="gpi-frame__divider" aria-hidden="true" />
                            <LoveLanguagePie
                                profile={model.partners[0]?.loveLanguage}
                                name={myName}
                            />
                            <LoveLanguagePie
                                profile={model.partners[1]?.loveLanguage}
                                name={partnerName}
                            />
                        </div>
                    </div>
                </>
            )}
        </>
    );
};
