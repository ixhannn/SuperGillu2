import React from 'react';
import { BottomNav } from './BottomNav';
import { FloatingHearts } from './FloatingHearts';
import { LiveBackground } from './LiveBackground';
import { TogetherMode } from './TogetherMode';
import { ViewState } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  setView: (view: ViewState) => void;
  notifications?: {
    timeline?: boolean;
    moments?: boolean;
    keepsakes?: boolean;
  };
}

export const Layout: React.FC<LayoutProps> = ({ children, currentView, setView, notifications }) => {
  return (
    <div className="fixed inset-0 bg-tulika-50 text-gray-800 overflow-hidden flex flex-col">

      {/* Ambient Particle Layer */}
      <FloatingHearts />

      {/* Live WebGL Fluid Aurora Background */}
      <LiveBackground />

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 w-full max-w-md mx-auto overflow-y-auto overflow-x-hidden no-scrollbar smooth-scroll pt-safe pb-32">
        {children}
      </main>

      {/* Global Features */}
      <TogetherMode />

      {/* Navigation */}
      <BottomNav currentView={currentView} setView={setView} notifications={notifications} />
    </div>
  );
};