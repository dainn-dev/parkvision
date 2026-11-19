import React from 'react';
import { Link } from 'react-router';

/**
 * Building blocks for the landing page in the "Tesla" system (design-md/tesla):
 * full-viewport image sections, 4px buttons, colour-only 0.33s transitions,
 * weights 400/500 only, no shadows, no gradients on UI.
 */

const BUTTON_BASE =
  'inline-flex min-h-10 w-full items-center justify-center rounded-[4px] border-[3px] border-transparent px-4 text-sm font-medium transition-[background-color,color,border-color] duration-[330ms] focus-visible:outline-none focus-visible:border-[var(--t-ink)] sm:w-auto sm:min-w-[200px] whitespace-nowrap cursor-pointer';

const BUTTON_VARIANTS = {
  primary: 'bg-[var(--t-blue)] text-[#fff] hover:bg-[var(--t-blue-hover)]',
  secondary: 'bg-[var(--t-ash)] text-[var(--t-body)] hover:bg-[var(--t-line-strong)]',
  /** over photography: always white, whatever the theme */
  onImage: 'bg-white/90 text-[#393c41] hover:bg-white',
} as const;

type Variant = keyof typeof BUTTON_VARIANTS;

export const TeslaButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
> = ({ variant = 'primary', className = '', ...props }) => (
  <button type="button" className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props} />
);

export const TeslaLinkButton: React.FC<{ to: string; variant?: Variant; children: React.ReactNode }> = ({
  to,
  variant = 'primary',
  children,
}) => (
  <Link to={to} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]}`}>
    {children}
  </Link>
);

export const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`mx-auto w-full max-w-[1383px] px-6 sm:px-10 ${className}`}>{children}</div>
);

interface FullBleedProps {
  id?: string;
  image: string;
  /** describes what the render shows; these are illustrations from the 3D model */
  alt: string;
  title: React.ReactNode;
  titleId?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional text colour override. The default is white over the dark image scrim. */
  tone?: 'ink' | 'white';
  /** where the image is anchored when it is cropped (portrait screens) */
  focus?: string;
  eager?: boolean;
  as?: 'h1' | 'h2';
  footnote?: React.ReactNode;
  /** enlarge the render (anchored at the bottom) to crop clutter off its top edge */
  zoom?: number;
}

/** A focused image section with a clear title and actions. */
export const FullBleed: React.FC<FullBleedProps> = ({
  id,
  image,
  alt,
  title,
  titleId,
  subtitle,
  actions,
  tone = 'white',
  focus = 'center',
  eager = false,
  as: Heading = 'h2',
  footnote,
  zoom = 1,
}) => {
  const text = tone === 'white' ? 'text-[#fff]' : 'text-[#171a20]';
  const sub = tone === 'white' ? 'text-[#ffffffd9]' : 'text-[#393c41]';
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="relative flex min-h-[680px] scroll-mt-0 flex-col items-center justify-between overflow-hidden px-6 pb-14 pt-32 text-center sm:min-h-[740px] sm:pb-20 sm:pt-36"
    >
      <img
        src={image}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="absolute inset-0 z-0 h-full w-full object-cover"
        style={{ objectPosition: focus, transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: '50% 100%' }}
      />
      {/* a scrim only where the text sits (top) and behind the buttons (bottom); the render itself stays untouched */}
      <div aria-hidden="true" className="absolute inset-0 z-[1] [background-image:linear-gradient(to_bottom,rgba(10,16,22,0.5),rgba(10,16,22,0)_42%,rgba(10,16,22,0)_72%,rgba(10,16,22,0.3))]" />
      <div className="relative z-10">
        <Heading id={titleId} className={`mx-auto max-w-3xl text-[28px] font-medium leading-[1.2] sm:text-[40px] ${text}`}>
          {title}
        </Heading>
        {subtitle && <p className={`mx-auto mt-2 max-w-xl text-sm leading-5 ${sub}`}>{subtitle}</p>}
        {footnote && <p className={`mx-auto mt-3 max-w-xl text-xs leading-5 ${sub}`}>{footnote}</p>}
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-3">
        {actions && <div className="flex w-full max-w-[420px] flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:gap-6">{actions}</div>}
      </div>
    </section>
  );
};

/** Plain white section with a calm heading block. */
export const Plain: React.FC<{
  id?: string;
  titleId: string;
  title: string;
  lead?: string;
  ash?: boolean;
  children: React.ReactNode;
}> = ({ id, titleId, title, lead, ash = false, children }) => (
  <section
    id={id}
    aria-labelledby={titleId}
    className={`scroll-mt-14 py-20 sm:py-28 ${ash ? 'bg-[#f2f4f5] dark:bg-[var(--t-ash)]' : 'bg-[var(--t-canvas)]'}`}
  >
    <Container>
      <div className="max-w-2xl">
        <h2 id={titleId} className="text-[28px] font-medium leading-[1.2] text-[var(--t-ink)] sm:text-[40px]">
          {title}
        </h2>
        {lead && <p className="mt-3 text-sm leading-5 text-[var(--t-body)]">{lead}</p>}
      </div>
      <div className="mt-12 sm:mt-14">{children}</div>
    </Container>
  </section>
);
