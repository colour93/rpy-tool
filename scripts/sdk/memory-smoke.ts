import { RenpyProjectSdk } from '../../src/sdk/project'
import { MemoryFileAdapter } from '../../src/sdk/memory-file-adapter'

const sdk = new RenpyProjectSdk(
  new MemoryFileAdapter(
    {
      'game/script.rpy': [
        'define e = Character("艾琳", image="e")',
        'image e happy = "images/e_happy.png"',
        'label start:',
        '    e "Hello"',
      ].join('\n'),
      'game/images/e_happy.png': new Blob(['fake image']),
    },
    'sdk-memory-smoke',
  ),
)

let snapshot = await sdk.scan()
const dialogue = snapshot.index.lines.find((line) => line.kind === 'dialogue')
const happyState = snapshot.index.characters
  .flatMap((character) => character.states)
  .find((state) => state.imageTag === 'e happy')

if (!dialogue) throw new Error('没有解析到对白行')
if (!happyState) throw new Error('没有解析到 e happy 立绘状态')

const applied = await sdk.applyDialogueSprite(snapshot, dialogue, {
  state: happyState,
  text: '你好，SDK。',
})
snapshot = applied.snapshot

const updated = await sdk.readTextFile(dialogue.filePath)
if (!updated.includes('e happy "你好，SDK。"')) {
  throw new Error(`套用立绘失败：\n${updated}`)
}

console.log(
  JSON.stringify(
    {
      workspace: snapshot.name,
      files: snapshot.files.length,
      lines: snapshot.index.lines.length,
      characters: snapshot.index.characters.length,
      assets: snapshot.index.assets.length,
      updatedLine: applied.raw.trim(),
    },
    null,
    2,
  ),
)
