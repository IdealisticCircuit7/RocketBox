import React from 'react';
import { FolderTagIconId } from '../../services/deckFilterService';

interface FolderTagIconGlyphProps {
  readonly icon: FolderTagIconId;
  readonly className?: string;
}

const ICON_PATHS: Readonly<Record<FolderTagIconId, React.ReactNode>> = {
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  rocket: (
    <>
      <path d="M12 3c4 3 5 7 5 11H7c0-4 1-8 5-11Z" />
      <circle cx="12" cy="10" r="1.5" />
      <path d="m7 12-3 4 3-1m10-3 3 4-3-1m-7 2 2 4 2-4" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m12 12 8-4.5M12 12v9M12 12 4 7.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="M19 15v4m-2-2h4M5 16v3m-1.5-1.5h3" />
    </>
  ),
  shield: (
    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polygon points="14.8 9.2 13 13 9.2 14.8 11 11 14.8 9.2" />
    </>
  ),
  tag: (
    <>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-7 7-9-9Z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" />
    </>
  ),
  environment: (
    <>
      <path d="m3 19 6-8 4 5 3-4 5 7H3Z" />
      <circle cx="17.5" cy="7.5" r="2.2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  audio: (
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.8 5.8a9 9 0 0 1 0 12.4" />
    </>
  ),
  motion: (
    <>
      <path d="M3 16c3-7 6-7 9 0s6 7 9 0" />
      <circle cx="7.5" cy="11.5" r="1.5" />
      <circle cx="16.5" cy="12.5" r="1.5" />
    </>
  ),
};

export const FOLDER_TAG_ICON_OPTIONS: readonly {
  readonly id: FolderTagIconId;
  readonly label: string;
}[] = [
  { id: 'tag', label: 'Etiqueta' },
  { id: 'folder', label: 'Pasta' },
  { id: 'person', label: 'Personagem' },
  { id: 'rocket', label: 'Missão / Veículo' },
  { id: 'environment', label: 'Cenário' },
  { id: 'cube', label: 'Objeto / 3D' },
  { id: 'image', label: 'Textura' },
  { id: 'sparkles', label: 'Material / Destaque' },
  { id: 'motion', label: 'Animação' },
  { id: 'audio', label: 'Áudio' },
  { id: 'layers', label: 'Camadas' },
  { id: 'shield', label: 'Protegido' },
  { id: 'compass', label: 'Exploração' },
];

export function resolveCategoryIcon(
  categoria?: string,
  kind?: string
): FolderTagIconId {
  if (kind === 'project') return 'layers';
  if (kind === 'package') return 'folder';
  const normalized = (categoria ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('personagem')) return 'person';
  if (normalized.includes('veiculo')) return 'rocket';
  if (normalized.includes('cenario')) return 'environment';
  if (normalized.includes('objeto')) return 'cube';
  if (normalized.includes('textura')) return 'image';
  if (normalized.includes('material')) return 'sparkles';
  if (normalized.includes('animacao')) return 'motion';
  if (normalized.includes('audio')) return 'audio';
  return 'tag';
}

export const FolderTagIconGlyph: React.FC<FolderTagIconGlyphProps> = ({
  icon,
  className,
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {ICON_PATHS[icon] ?? ICON_PATHS.tag}
  </svg>
);
