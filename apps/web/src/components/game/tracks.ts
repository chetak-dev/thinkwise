import type { TrackId } from '@thinkwise/shared';

export interface TrackInfo {
  id: TrackId;
  emoji: string;
  name: string;
  mood: string;
}

export const TRACKS: TrackInfo[] = [
  { id: 'ocean-drive', emoji: '🌊', name: 'Ocean Drive', mood: 'Breezy, sunlit groove' },
  { id: 'bubble-pop', emoji: '🫧', name: 'Bubble Pop', mood: 'Bouncy, playful plucks' },
  { id: 'night-library', emoji: '📚', name: 'Night Library', mood: 'Soft, thoughtful keys' },
  { id: 'power-up', emoji: '🎮', name: 'Power-Up', mood: 'Chiptune arcade energy' },
  { id: 'summit', emoji: '🏔️', name: 'Summit', mood: 'Big, rising anthem' },
  { id: 'campfire', emoji: '🔥', name: 'Campfire', mood: 'Warm, gentle strum' },
  { id: 'jazz-cafe', emoji: '☕', name: 'Jazz Café', mood: 'Easy swing and brushes' },
  { id: 'dhol-dance', emoji: '🥁', name: 'Dhol Dance', mood: 'Festive bhangra beat' },
  { id: 'orbit', emoji: '🛰️', name: 'Orbit', mood: 'Floating space pads' },
  { id: 'final-lap', emoji: '🏁', name: 'Final Lap', mood: 'Fast, racing pulse' },
];
