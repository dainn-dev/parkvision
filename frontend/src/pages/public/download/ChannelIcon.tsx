import React from 'react';
import type { ReleaseChannel } from '../../../services/api';

interface ChannelIconProps {
  channel: ReleaseChannel;
}

// Own drawings of the two platform marks (lucide-react ships no brand logos).
// Decorative: the card title already names the platform.
const WindowsLogo: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    data-testid="channel-icon-windows"
    className="size-6 text-[#00A4EF]"
  >
    <path d="M3 3h8.5v8.5H3zM12.5 3H21v8.5h-8.5zM3 12.5h8.5V21H3zM12.5 12.5H21V21h-8.5z" />
  </svg>
);

const AndroidLogo: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    data-testid="channel-icon-android"
    className="size-6 text-[#3DDC84]"
  >
    {/* Head: a half disc with the two eyes cut out. */}
    <path
      fillRule="evenodd"
      d="M5 10a7 7 0 0 1 14 0zM8.4 6.6a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0zM13.8 6.6a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0z"
    />
    <path d="M8.2 2.6 9.4 4.5M15.8 2.6l-1.2 1.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
    <rect x="5" y="10.8" width="14" height="7.2" rx="1.2" />
    <rect x="8" y="16.5" width="2.3" height="5" rx="1.15" />
    <rect x="13.7" y="16.5" width="2.3" height="5" rx="1.15" />
    <rect x="1.6" y="10.8" width="2.5" height="6.5" rx="1.25" />
    <rect x="19.9" y="10.8" width="2.5" height="6.5" rx="1.25" />
  </svg>
);

export const ChannelIcon: React.FC<ChannelIconProps> = ({ channel }) => (
  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
    {channel === 'android' ? <AndroidLogo /> : <WindowsLogo />}
  </span>
);
