import type { ReactNode } from 'react';

function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const MealIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M7 2v20" />
    <path d="M4 2v6a3 3 0 0 0 6 0V2" />
    <path d="M17 22V2c-2.2 1.3-3.5 3.8-3.5 7v4h3.5" />
  </Svg>
);

export const WorkoutIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M6.5 6.5v11" />
    <path d="M17.5 6.5v11" />
    <path d="M6.5 12h11" />
    <path d="M3.5 9v6" />
    <path d="M20.5 9v6" />
  </Svg>
);

export const SleepIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Svg>
);

export const BodyIcon = ({ size }: P) => (
  <Svg size={size}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M8 9a5 5 0 0 1 8 0" />
    <path d="M12 9l1.5-2" />
  </Svg>
);

export const SettingsIcon = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

export const BackIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);

export const CheckIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);

export const TrashIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </Svg>
);
