import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Moon, Sun, X } from 'lucide-react';
import type { PublicViewType } from '../../../lib/publicRoutes';
import { LanguageSwitcher } from '../../../components/common/LanguageSwitcher';

interface NavItem {
  label: string;
  /** landing anchor id, or a route */
  section?: string;
  to?: string;
}

const NAV: NavItem[] = [
  { label: 'Features', section: 'features' },
  { label: 'Demo', section: 'simulator' },
  { label: 'How it works', section: 'how-it-works' },
  { label: 'Solutions', section: 'solutions' },
  { label: 'Pricing', section: 'pricing' },
  { label: '3D Tour', to: '/tour' },
  { label: 'Download', to: '/download' },
];

function scrollToSection(id: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

interface LandingNavbarProps {
  onNavigate: (view: PublicViewType) => void;
  currentView: PublicViewType;
  isAuthenticated: boolean;
  onOpenWorkspace: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  /** px from the top of the viewport (the admin preview banner sits above it) */
  top?: number;
}

const NAV_BUTTON =
  'inline-flex min-h-8 cursor-pointer items-center rounded-[4px] px-4 text-sm font-medium transition-colors duration-[330ms] hover:bg-[var(--t-hover)]';

/** Shared marketing header: transparent over the home hero and frosted on every other page or after scrolling. */
export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  onNavigate,
  currentView,
  isAuthenticated,
  onOpenWorkspace,
  theme,
  onToggleTheme,
  top = 0,
}) => {
  const { t } = useTranslation('landing');
  const { t: tl } = useTranslation('layout');
  const [scrolled, setScrolled] = useState(currentView !== 'landing');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingSection, setPendingSection] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(currentView !== 'landing' || window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [currentView]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  useEffect(() => {
    if (currentView !== 'landing' || !pendingSection) return;
    const timeout = window.setTimeout(() => {
      scrollToSection(pendingSection);
      setPendingSection(null);
    }, 240);
    return () => window.clearTimeout(timeout);
  }, [currentView, pendingSection]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The hero surface follows the selected theme; use matching ink until the header frosts on scroll.
  const frosted = scrolled || menuOpen;
  const ink = frosted ? 'text-[var(--t-ink)]' : theme === 'dark' ? 'text-[#f4f4f4]' : 'text-[#171a20]';
  const hover = frosted ? '[--t-hover:rgba(128,128,128,0.14)]' : theme === 'dark' ? '[--t-hover:rgba(255,255,255,0.1)]' : '[--t-hover:rgba(23,26,32,0.08)]';

  const go = (item: NavItem) => {
    setMenuOpen(false);
    if (!item.section) return;
    if (currentView === 'landing') {
      scrollToSection(item.section);
    } else {
      setPendingSection(item.section);
      onNavigate('landing');
    }
  };

  const label = (item: NavItem) => (item.to ? tl(item.label) : t(item.label));

  return (
    <header
      className={`tesla fixed inset-x-0 z-50 transition-[background-color] duration-[330ms] ${hover} ${
        frosted ? 'bg-[var(--t-frost)] backdrop-blur-md' : 'bg-transparent'
      }`}
      style={{ top }}
    >
      <div className={`mx-auto flex h-14 w-full max-w-[1383px] items-center justify-between gap-4 px-6 sm:px-10 ${ink}`}>
        <Link
          to="/"
          onClick={() => window.scrollTo({ top: 0 })}
          className="shrink-0 text-[15px] font-medium tracking-[0.32em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-blue)]"
          aria-label="ParkVision"
        >
          PARKVISION
        </Link>

        <nav className="hidden items-center lg:flex" aria-label={tl('Main navigation')}>
          {NAV.map((item) =>
            item.to ? (
              <Link key={item.label} to={item.to} className={NAV_BUTTON}>
                {label(item)}
              </Link>
            ) : (
              <button key={item.label} type="button" onClick={() => go(item)} className={NAV_BUTTON}>
                {label(item)}
              </button>
            ),
          )}
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitcher
            showIcon={false}
            className="min-h-8 border-transparent bg-transparent px-3 text-sm font-medium text-current shadow-none hover:bg-[var(--t-hover)] hover:text-current max-sm:hidden"
          />
          <button
            type="button"
            onClick={onToggleTheme}
            className={`${NAV_BUTTON} px-2.5 max-sm:hidden`}
            aria-label={theme === 'dark' ? tl('Switch to Light Mode') : tl('Switch to Dark Mode')}
            title={theme === 'dark' ? tl('Switch to Light Mode') : tl('Switch to Dark Mode')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
          {isAuthenticated ? (
            <button type="button" onClick={onOpenWorkspace} className={`${NAV_BUTTON} max-sm:hidden`}>
              {tl('Back to Admin Workspace')}
            </button>
          ) : (
            <button type="button" onClick={() => onNavigate('login')} className={`${NAV_BUTTON} max-sm:hidden`}>
              {tl('Sign In')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            className={`${NAV_BUTTON} lg:hidden`}
          >
            {menuOpen ? <X className="h-5 w-5" aria-label={t('Close menu')} /> : t('Menu')}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="landing-menu"
          className="h-[calc(100svh-3.5rem)] overflow-y-auto bg-[var(--t-canvas)] px-6 pb-10 pt-4 lg:hidden"
        >
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <Link
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-[4px] px-3 py-3 text-[17px] font-medium text-[var(--t-ink)] hover:bg-[var(--t-ash)]"
                  >
                    {label(item)}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => go(item)}
                    className="block w-full cursor-pointer rounded-[4px] px-3 py-3 text-left text-[17px] font-medium text-[var(--t-ink)] hover:bg-[var(--t-ash)]"
                  >
                    {label(item)}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center gap-2 border-t border-[var(--t-line)] pt-6 text-[var(--t-ink)] sm:hidden">
            <LanguageSwitcher
              className="min-h-10 border-[var(--t-line-strong)] bg-transparent px-3 text-sm font-medium text-current shadow-none hover:bg-[var(--t-ash)] hover:text-current"
            />
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[4px] px-3 text-sm font-medium hover:bg-[var(--t-ash)]"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              {theme === 'dark' ? tl('Switch to Light Mode') : tl('Switch to Dark Mode')}
            </button>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="min-h-10 cursor-pointer rounded-[4px] bg-[var(--t-blue)] text-sm font-medium text-[#fff]"
              >
                {tl('Back to Admin Workspace')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="min-h-10 cursor-pointer rounded-[4px] bg-[var(--t-blue)] text-sm font-medium text-[#fff]"
                >
                  {t('Start 14-day free trial')}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="min-h-10 cursor-pointer rounded-[4px] bg-[var(--t-ash)] text-sm font-medium text-[var(--t-body)]"
                >
                  {tl('Sign In')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

/** Minimal footer: one row of small links on the canvas. */
export const LandingFooter: React.FC<{ onNavigate: (view: PublicViewType) => void }> = ({ onNavigate }) => {
  const { t } = useTranslation('landing');
  const { t: tl } = useTranslation('layout');
  const links: { label: string; onClick?: () => void; to?: string }[] = [
    { label: tl('Privacy Policy'), onClick: () => onNavigate('privacy') },
    { label: tl('Terms of Service'), onClick: () => onNavigate('terms') },
    { label: t('Service level agreement'), onClick: () => onNavigate('sla') },
    { label: tl('3D Tour'), to: '/tour' },
    { label: tl('Download'), to: '/download' },
    { label: tl('Sign In'), onClick: () => onNavigate('login') },
  ];
  return (
    <footer className="tesla bg-[var(--t-canvas)] py-10">
      <nav aria-label={t('Footer')} className="mx-auto flex max-w-[1383px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 text-xs">
        <span className="text-[var(--t-pewter)]">ParkVision © {new Date().getFullYear()}</span>
        {links.map((l) =>
          l.to ? (
            <Link key={l.label} to={l.to} className="tesla-link">
              {l.label}
            </Link>
          ) : (
            <button key={l.label} type="button" onClick={l.onClick} className="tesla-link cursor-pointer">
              {l.label}
            </button>
          ),
        )}
      </nav>
    </footer>
  );
};
