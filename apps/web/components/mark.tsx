// Three seals that overlap in one point: the record, the network and the person.
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="16" cy="11" r="7.5" />
        <circle cx="11" cy="20" r="7.5" />
        <circle cx="21" cy="20" r="7.5" />
      </g>
      <circle cx="16" cy="17" r="2.2" fill="#b4321f" />
    </svg>
  );
}
