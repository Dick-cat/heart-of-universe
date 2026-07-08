'use client';

import { useGraphStore } from '@/hooks/useGraphStore';
import { StickyNote } from './StickyNote';

export function StickyNotesLayer() {
  const stickyNotes = useGraphStore((s) => s.stickyNotes);
  return (
    <>
      {stickyNotes.map((note) => (
        <StickyNote key={note.id} note={note} />
      ))}
    </>
  );
}
