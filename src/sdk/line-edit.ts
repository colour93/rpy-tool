import type { CharacterState, RpyLine } from '@/types'
import {
  buildShowCommand,
  replaceDialogueSprite,
  replaceEditableLine,
  replaceLineSpeaker,
} from './rpy-parser'

export interface SaveEditableLineInput {
  text: string
  speakerId: string | null
}

export interface ShowCommandInput {
  state: CharacterState
  position?: string
  transition?: string
  variant: 'show' | 'scene'
}

export function makeInsertedLine(anchor: RpyLine) {
  const indent = anchor.indent ?? ''
  if (anchor.kind === 'choice') return `${indent}"":`
  if (anchor.characterId) {
    const head = [anchor.characterId, anchor.target].filter(Boolean).join(' ')
    return `${indent}${head} ""`
  }
  return `${indent}""`
}

export function replaceEditableLineContent(
  raw: string,
  input: SaveEditableLineInput,
) {
  return replaceLineSpeaker(
    replaceEditableLine(raw, input.text),
    input.speakerId,
  )
}

export function replaceDialogueLineSprite(
  raw: string,
  state: CharacterState,
  text: string,
) {
  return replaceEditableLine(replaceDialogueSprite(raw, state), text)
}

export function makeShowCommand(anchor: RpyLine, input: ShowCommandInput) {
  return buildShowCommand({
    imageTag: input.state.imageTag,
    position: input.position,
    transition: input.transition || undefined,
    indent: anchor.indent ?? '    ',
    variant: input.variant,
  })
}
