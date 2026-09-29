import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  Car,
  Layers,
  ArrowRight,
  LogIn,
  UserPlus,
  Sun,
  Moon,
  Menu,
  X,
  Sparkles,
  PhoneCall,
  ExternalLink,
  ChevronRight,
  Sliders
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { useTranslation } from 'react-i18next';
import { Button, Badge } from '../ui';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

export type PublicViewType = 'landing' | 'login' | 'register' | 'privacy' | 'terms' | 'sla' | 'activate' | 'reset-password' | 'find-car';

interface PublicNavbarProps {
  currentView: PublicViewType;
  onNavigate: (view: PublicViewType) => void;
  onScrollToSection?: (sectionId: string) => void;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  currentView,
  onNavigate,
  onScrollToSection
}) => {
  const { isAuthenticated, theme, toggleTheme } = usePlatform();
  const { t } = useTranslation('layout');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (currentView !== 'landing') {
      onNavigate('landing');
      setTimeout(() => {
        if (onScrollToSection) onScrollToSection(sectionId);
      }, 150);
    } else if (onScrollToSection) {
      onScrollToSection(sectionId);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#30363d] bg-[#0d0e12]/90 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] flex items-center justify-center text-slate-950 font-black shadow-lg shadow-[#58a6ff]/20 group-hover:scale-105 transition-transform">
            <Car className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-white tracking-tight font-mono">
                ANPR<span className="text-[#58a6ff]">.CLOUD</span>
              </span>
              <Badge variant="blue" size="sm" className="hidden sm:inline-flex text-[10px] font-mono">
                SaaS v4.8
              </Badge>
            </div>
            <p className="text-[10px] text-[#8b949e] font-medium hidden sm:block">
              {t('Smart Access Control & Barriers')}
            </p>
          </div>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs font-medium text-[#8b949e]">
          <button
            onClick={() => handleNavClick('features')}
            className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer"
          >
            {t('Core Features')}
          </button>
          <button
            onClick={() => handleNavClick('simulator')}
            className="px-3 py-1.5 rounded-lg hover:text-[#58a6ff] hover:bg-[#58a6ff]/10 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#58a6ff]" />
            Live Demo ANPR
          </button>
          <button
            onClick={() => handleNavClick('how-it-works')}
            className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer"
          >
            {t('Operating Model')}
          </button>
          <button
            onClick={() => handleNavClick('solutions')}
            className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer"
          >
            {t('Solutions')}
          </button>
          <button
            onClick={() => handleNavClick('pricing')}
            className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer"
          >
            {t('Pricing')}
          </button>
          <button
            onClick={() => handleNavClick('faq')}
            className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer"
          >
            {t('FAQ')}
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          <LanguageSwitcher />
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer border border-[#30363d]"
            title={theme === 'dark' ? t('Switch to Light Mode') : t('Switch to Dark Mode')}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[#d29922]" /> : <Moon className="w-4 h-4 text-[#58a6ff]" />}
          </button>

          {isAuthenticated ? (
            /* Return to Dashboard when authenticated */
            <Button
              variant="primary"
              size="sm"
              icon={ArrowRight}
              onClick={() => onNavigate('landing')} // In App.tsx this will switch to workspace view
              className="bg-[#238636] hover:bg-[#2ea043] border-[#3fb950] text-white"
            >
              {t('Back to Admin Workspace')}
            </Button>
          ) : (
            <>
              {/* Login Button */}
              <button
                onClick={() => onNavigate('login')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentView === 'login'
                    ? 'bg-[#21262d] text-[#58a6ff] border border-[#58a6ff]/40'
                    : 'text-[#c9d1d9] hover:text-white hover:bg-[#161b22] border border-[#30363d]'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 text-[#58a6ff]" />
                <span>{t('Sign In')}</span>
              </button>

              {/* Free Trial / Register Button */}
              <Button
                variant="primary"
                size="sm"
                icon={UserPlus}
                onClick={() => onNavigate('register')}
                className="shadow-sm shadow-[#58a6ff]/30 text-xs py-2 px-3.5"
              >
                {t('14-Day Free Trial')}
              </Button>
            </>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-[#30363d] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-[#30363d] bg-[#161b22] px-4 py-4 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-2 gap-2 pb-3 border-b border-[#30363d]">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('login');
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#0d0e12] border border-[#30363d] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 text-[#58a6ff]" /> {t('Sign In')}
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('register');
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#58a6ff] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> {t('Try Free')}
            </button>
          </div>

          <div className="space-y-1 text-sm font-medium text-[#c9d1d9]">
            <button
              onClick={() => handleNavClick('features')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0d0e12] flex items-center justify-between"
            >
              <span>{t('Core Features')}</span>
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            </button>
            <button
              onClick={() => handleNavClick('simulator')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0d0e12] flex items-center justify-between text-[#58a6ff]"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#58a6ff]" /> {t('Try the Live ANPR Demo')}
              </span>
              <ChevronRight className="w-4 h-4 text-[#58a6ff]" />
            </button>
            <button
              onClick={() => handleNavClick('how-it-works')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0d0e12] flex items-center justify-between"
            >
              <span>{t('3-Step Operating Model')}</span>
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            </button>
            <button
              onClick={() => handleNavClick('solutions')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0d0e12] flex items-center justify-between"
            >
              <span>{t('Solutions by Industry')}</span>
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            </button>
            <button
              onClick={() => handleNavClick('pricing')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0d0e12] flex items-center justify-between"
            >
              <span>{t('Service Pricing')}</span>
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            </button>
            <button
              onClick={() => handleNavClick('faq')}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0d0e12] flex items-center justify-between"
            >
              <span>{t('FAQ')}</span>
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            </button>
          </div>

          <div className="pt-2 border-t border-[#30363d] flex items-center justify-between text-xs text-[#8b949e]">
            <button onClick={() => { setMobileMenuOpen(false); onNavigate('privacy'); }} className="hover:text-white">
              {t('Privacy')}
            </button>
            <span>•</span>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate('terms'); }} className="hover:text-white">
              {t('Terms')}
            </button>
            <span>•</span>
            <button onClick={() => { setMobileMenuOpen(false); onNavigate('sla'); }} className="hover:text-white">
              {t('99.9% SLA Commitment')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
