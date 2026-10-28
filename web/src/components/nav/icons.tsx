type P = { className?: string };
const base = "h-5 w-5 shrink-0";
const svg = (d: React.ReactNode) =>
  function Icon({ className }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className ?? base}>
        {d}
      </svg>
    );
  };

export const HomeIcon = svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>);
export const MapIcon = svg(<><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>);
export const CalendarIcon = svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>);
export const CarIcon = svg(<><path d="M5 17h14M5 17v2M19 17v2" /><path d="M3 13.5 5 8a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5.5V17H3v-3.5Z" /><circle cx="7.5" cy="14" r="1" /><circle cx="16.5" cy="14" r="1" /></>);
export const BoltIcon = svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
export const UserIcon = svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
export const RouteIcon = svg(<><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" /></>);
export const ChartIcon = svg(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
