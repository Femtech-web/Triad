// Three seals that meet in one point: the record, the network and the person.
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="triad-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#8fb0ff" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#triad-ring)" strokeWidth="1.7">
        <circle cx="16" cy="11.2" r="7.2" />
        <circle cx="11.2" cy="19.6" r="7.2" />
        <circle cx="20.8" cy="19.6" r="7.2" />
      </g>
      <circle cx="16" cy="16.8" r="2.1" fill="#3ddc9a" />
    </svg>
  );
}
