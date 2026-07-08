import { RenpyProjectSdk } from '../../src/sdk/project'
import { MemoryFileAdapter } from '../../src/sdk/memory-file-adapter'

const sdk = new RenpyProjectSdk(
  new MemoryFileAdapter(
    {
      'game/characters.rpy': [
        'image tamu = "images/character/tamu.png"',
        'define tamu_c = Character("塔木")',
      ].join('\n'),
      'game/script.rpy': [
        'init python:',
        '    register_chapter(',
        '        chapter_id="1",',
        '        label="chapter_1",',
        '        thumbnail="images/cg/0.png",',
        '    )',
        '    gallery_cg(',
        '        item_id="1_0",',
        '        image="images/cg/0.png",',
        '    )',
        '',
        'label chapter_1:',
        '    show tamu at left with dissolve',
        '    tamu_c "Hello"',
        '    "Narration"',
        '    menu:',
        '        "Continue" if persistent.ready:',
        '            tamu_c "Go"',
      ].join('\n'),
      'game/screens.rpy': [
        'screen main_menu():',
        '    text "Not story text"',
        '    style "main_menu_frame"',
        '    id "window"',
        '    background "gui/overlay/main_menu.png"',
        '    add "new_gui/components/dialog/frame.svg"',
      ].join('\n'),
      'game/images/character/tamu.png': new Blob(['fake image']),
      'game/images/cg/0.png': new Blob(['fake image']),
      'game/gui/overlay/main_menu.png': new Blob(['fake image']),
      'game/new_gui/components/dialog/frame.svg': new Blob(['fake svg']),
    },
    'parser-optimization-smoke',
  ),
)

const snapshot = await sdk.scan()

const screenEditable = snapshot.index.lines.filter(
  (line) => line.filePath === 'game/screens.rpy' && line.editable,
)
if (screenEditable.length > 0) {
  throw new Error(
    `screen 行不应进入可编辑队列：${screenEditable
      .map((line) => line.raw.trim())
      .join(' / ')}`,
  )
}

const tamu = snapshot.index.characters.find(
  (character) => character.id === 'tamu_c',
)
if (!tamu?.states.some((state) => state.imageTag === 'tamu')) {
  throw new Error('tamu_c 没有关联到 image tamu')
}

const showLine = snapshot.index.lines.find((line) => line.kind === 'show')
if (showLine?.target !== 'tamu' || showLine.modifier !== 'dissolve') {
  throw new Error(`show 解析错误：${JSON.stringify(showLine)}`)
}

const conditionalChoice = snapshot.index.lines.find(
  (line) => line.kind === 'choice' && line.text === 'Continue',
)
if (!conditionalChoice?.editable) {
  throw new Error('带 if 条件的菜单选项应解析为可编辑 choice')
}

for (const path of [
  'images/cg/0.png',
  'gui/overlay/main_menu.png',
  'new_gui/components/dialog/frame.svg',
]) {
  const asset = snapshot.index.assets.find((item) => item.path === path)
  if (!asset?.referenced) throw new Error(`${path} 未被标记为已引用`)
}

const svg = snapshot.files.find(
  (file) => file.path === 'game/new_gui/components/dialog/frame.svg',
)
if (svg?.kind !== 'image') throw new Error('SVG 应归类为 image')

console.log(
  JSON.stringify(
    {
      editable: snapshot.index.lines.filter((line) => line.editable).length,
      characters: snapshot.index.characters.map((character) => ({
        id: character.id,
        states: character.states.map((state) => state.imageTag),
      })),
      referencedAssets: snapshot.index.assets
        .filter((asset) => asset.referenced)
        .map((asset) => asset.path)
        .sort(),
    },
    null,
    2,
  ),
)
