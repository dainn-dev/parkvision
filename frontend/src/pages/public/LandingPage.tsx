import React from 'react';
import type { PublicViewType } from '../../lib/publicRoutes';
import { HeroSection } from './landing/HeroSection';
import { PipelineSection } from './landing/PipelineSection';
import { DemoSection } from './landing/DemoSection';
import { FeaturesSection } from './landing/FeaturesSection';
import { SolutionsSection } from './landing/SolutionsSection';
import { AppsSection } from './landing/AppsSection';
import { PricingSection } from './landing/PricingSection';
import { FaqSection } from './landing/FaqSection';
import { FinalCtaSection } from './landing/FinalCtaSection';

interface LandingPageProps {
  onNavigate: (view: PublicViewType) => void;
  onSelectPlan?: (planId: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onSelectPlan }) => (
  <div className="w-full bg-background font-sans text-foreground antialiased">
    <HeroSection onNavigate={onNavigate} />
    <PipelineSection />
    <DemoSection />
    <FeaturesSection />
    <SolutionsSection />
    <AppsSection />
    <PricingSection onNavigate={onNavigate} onSelectPlan={onSelectPlan} />
    <FaqSection />
    <FinalCtaSection onNavigate={onNavigate} />
  </div>
);
