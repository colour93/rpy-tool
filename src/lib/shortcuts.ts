export const isMacPlatform =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform)

export const SHORTCUTS = {
  commandPalette: 'mod+k',
  save: 'mod+s',
  saveAll: 'mod+shift+s',
  selectAll: 'mod+a',
  rescan: 'F5',
  previousLine: 'K',
  nextLine: 'J',
  escape: 'Escape',
  commandPalettePrevious: '↑',
  commandPaletteNext: '↓',
  commandPaletteRun: 'Enter',
  reviewPassed: '1',
  reviewNeedsChanges: '2',
  reviewIgnored: '3',
  reviewReset: '0',
} as const

export function formatShortcut(combo: string) {
  return combo
    .split(' ')
    .map((chord) =>
      chord
        .split('+')
        .map((part) => formatShortcutPart(part))
        .join(isMacPlatform ? '' : '+'),
    )
    .join(' ')
}

export function shortcutDisplayParts(value: string) {
  return value
    .split(' ')
    .flatMap((chord, chordIndex, chords) => [
      ...shortcutChordParts(chord),
      ...(chordIndex < chords.length - 1
        ? [{ value: ' ', kind: 'separator' as const }]
        : []),
    ])
}

function formatShortcutPart(part: string) {
  const normalized = part.toLowerCase()
  if (normalized === 'mod') return isMacPlatform ? '⌘' : 'Ctrl'
  if (normalized === 'ctrl') return isMacPlatform ? '⌃' : 'Ctrl'
  if (normalized === 'shift') return isMacPlatform ? '⇧' : 'Shift'
  if (normalized === 'alt') return isMacPlatform ? '⌥' : 'Alt'
  if (normalized === 'meta') return isMacPlatform ? '⌘' : 'Meta'
  if (normalized === 'escape') return 'Esc'
  if (normalized === 'arrowup') return '↑'
  if (normalized === 'arrowdown') return '↓'
  if (normalized === 'arrowleft') return '←'
  if (normalized === 'arrowright') return '→'
  return part.length === 1 ? part.toUpperCase() : part
}

function shortcutChordParts(chord: string) {
  if (chord.includes('+')) {
    return chord
      .split('+')
      .flatMap((part, index, parts) => [
        { value: part, kind: shortcutPartKind(part) },
        ...(index < parts.length - 1
          ? [{ value: '+', kind: 'separator' as const }]
          : []),
      ])
  }

  return Array.from(chord).map((part) => ({
    value: part,
    kind: shortcutPartKind(part),
  }))
}

function shortcutPartKind(part: string) {
  return /^[⌘⌃⌥⇧]$/.test(part) ? ('modifier' as const) : ('key' as const)
}
