import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const TimelineIcon = () => (
  <svg {...base}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

export const MapIcon = () => (
  <svg {...base}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
  </svg>
);

export const PhotoIcon = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-8 8" />
  </svg>
);

export const TravelIcon = () => (
  <svg {...base}>
    <path d="M3 20h18M6 20l6-14 6 14M9.5 13h5" />
  </svg>
);

export const ProfileIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

export const HeartIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" />
  </svg>
);

export const CommentIcon = () => (
  <svg {...base}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const ChevronLeft = () => (
  <svg {...base}>
    <path d="m15 6-6 6 6 6" />
  </svg>
);

export const ChevronRight = () => (
  <svg {...base}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const BellIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
    <path d="M10 20a2 2 0 0 0 4 0" fill="none" />
  </svg>
);
