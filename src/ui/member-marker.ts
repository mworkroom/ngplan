import type { SheetMarker } from '../engine';

export const SHEET_MARKER_OPTIONS: readonly {
  readonly value: SheetMarker;
  readonly label: string;
}[] = [
  { value: 'NONE', label: '표시 없음' },
  { value: 'PINK_1', label: '1 · 분홍색' },
  { value: 'GREEN_2', label: '2 · 연두색' },
  { value: 'BLUE_3', label: '3 · 하늘색' },
];

export function sheetMarkerNumber(marker: SheetMarker): string | null {
  switch (marker) {
    case 'PINK_1':
      return '1';
    case 'GREEN_2':
      return '2';
    case 'BLUE_3':
      return '3';
    default:
      return null;
  }
}

export function sheetMarkerClassName(marker: SheetMarker): string {
  return `sheet-marker--${marker.toLowerCase().replace('_', '-')}`;
}

export function markedMemberName(name: string, marker: SheetMarker): string {
  const number = sheetMarkerNumber(marker);
  return number === null ? name : `${number}. ${name}`;
}
