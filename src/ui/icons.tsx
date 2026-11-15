/** Minimal stroke icon set (24×24, 1.75 stroke), drawn to match the UI. */
const paths: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  note: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5',
  group: 'M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M8 8h8v8H8z',
  ungroup: 'M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M9 9h3v3H9zM13 13h2v2h-2z',
  select: 'M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4M12 9v6M9 12h6',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1V4.5a1.5 1.5 0 0 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V13m0-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3L4.2 14a1.5 1.5 0 0 1 2.6-1.5L8 14.5',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  fit: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  palette: 'M12 3a9 9 0 0 0 0 18c1 0 1.5-.8 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01',
  shape: 'M4 4h7v7H4zM17.5 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM4 14h16v6H4z',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 18l-6-6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01',
  board: 'M3 5h18v14H3zM7 9h4v3H7zM14 13h3v2h-3zM11 10.5l3 3',
  check: 'M5 12l5 5L20 7',
  label: 'M4 7h16M4 12h10M4 17h7',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  line: 'M4 20 20 4',
  curve: 'M4 20C4 10 20 14 20 4',
  elbow: 'M4 20v-8h16V4',
  minus: 'M5 12h14',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  connect: 'M6 6a2 2 0 1 0 0 .01M18 18a2 2 0 1 0 0 .01M7.5 7.5l9 9',
  front: 'M8 8h12v12H8zM4 4h12v2M4 4v12h2',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  markdown: 'M3 6h18v12H3zM6 15V9l3 3 3-3v6M16 9v6M14 13l2 2 2-2',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[name]} />
    </svg>
  );
}
