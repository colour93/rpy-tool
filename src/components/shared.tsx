import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  UIEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Grid2x2,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  characterPreviewState,
  formatBytes,
  lineKey,
  lineMatchesQuery,
} from "@/appHelpers";
import { getImagePreviewUrl } from "@/services/thumbnails";
import { normalizePathKey } from "@/services/path-utils";
import type {
  CharacterState,
  CharacterRegistryItem,
  FileEntry,
  RpyLine,
} from "@/types";

export type InsertPosition = "before" | "after";

export function SidebarResizeHandle({
  onPointerDown,
  label = "调整侧栏宽度",
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  label?: string;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      className="group relative grid h-full cursor-col-resize place-items-center bg-transparent transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-all hover:bg-info/10 hover:after:w-1 hover:after:bg-info/40"
      title={label}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

export function LineList({
  lines,
  selectedLine,
  selectedLineKeys,
  onSelectLine,
  onDoubleClick,
  rowContextMenu,
  characters,
  emptyTitle = "暂无可展示行",
  highlightDirty,
  renderLineBadges,
  className,
  files,
  speakerClassName,
  searchMatchLineKeys,
}: {
  lines: RpyLine[];
  selectedLine?: RpyLine;
  selectedLineKeys?: Set<string>;
  onSelectLine: (
    line: RpyLine,
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  onDoubleClick?: (line: RpyLine) => void;
  rowContextMenu?: LineRowContextMenu;
  characters: CharacterRegistryItem[];
  emptyTitle?: string;
  highlightDirty?: (line: RpyLine) => boolean;
  renderLineBadges?: (line: RpyLine) => React.ReactNode;
  className?: string;
  files?: FileEntry[];
  speakerClassName?: string;
  searchMatchLineKeys?: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    line: RpyLine;
  } | null>(null);
  const activeKey = selectedLine ? lineKey(selectedLine) : "";
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );
  const virtual = useVirtualWindow(lines.length, 48, 8, containerRef);

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  function runRowAction(action: () => void, enabled = true) {
    if (!enabled) return;
    setMenu(null);
    action();
  }

  useEffect(() => {
    if (!activeKey) return;
    const index = lines.findIndex((line) => lineKey(line) === activeKey);
    if (index < 0 || !containerRef.current) return;
    const top = index * 48;
    const bottom = top + 48;
    const { scrollTop, clientHeight } = containerRef.current;
    if (top < scrollTop || bottom > scrollTop + clientHeight) {
      containerRef.current.scrollTop = Math.max(0, top - clientHeight / 2 + 24);
    }
  }, [activeKey, lines]);

  if (lines.length === 0) {
    return <EmptyState title={emptyTitle} className={className} />;
  }

  return (
    <div
      ref={containerRef}
      className={cn("h-full overflow-auto scrollbar-thin", className)}
      onScroll={virtual.onScroll}
    >
      <div className="relative" style={{ height: virtual.totalHeight }}>
        {lines.slice(virtual.start, virtual.end).map((line, offset) => {
          const character = line.characterId
            ? characterById.get(line.characterId)
            : undefined;
          const dirty = highlightDirty?.(line) ?? false;
          const badges = renderLineBadges?.(line);
          const speaker =
            character?.displayName ??
            line.characterId ??
            (line.kind === "narration"
              ? "旁白"
              : line.kind === "choice"
                ? "选项"
                : line.kind);
          const key = lineKey(line);
          const isActive = key === activeKey;
          const isSelected = selectedLineKeys
            ? selectedLineKeys.has(key)
            : isActive;
          const isSearchMatch = searchMatchLineKeys?.has(key) ?? false;
          return (
            <button
              key={key}
              type="button"
              onClick={(event) => onSelectLine(line, event)}
              onDoubleClick={() => onDoubleClick?.(line)}
              onContextMenu={(event) => {
                if (!rowContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                if (!isSelected) onSelectLine(line, event);
                setMenu({ x: event.clientX, y: event.clientY, line });
              }}
              style={{
                top: (virtual.start + offset) * 48,
                height: 48,
              }}
              className={cn(
                "group absolute left-0 grid w-full grid-cols-[3rem_9rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 text-left text-sm transition-colors",
                "hover:bg-secondary",
                line.kind === "label" && "bg-secondary/40 font-semibold",
                isSearchMatch && "bg-info/10",
                isSelected &&
                  "bg-info/15 ring-1 ring-inset ring-info/45 shadow-[inset_3px_0_0_var(--color-info)]",
                isActive &&
                  "bg-info/20 ring-2 ring-inset ring-info/70 shadow-[inset_5px_0_0_var(--color-info)]",
              )}
            >
              {dirty && (
                <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-r bg-warning" />
              )}
              <span className="font-mono text-[11px] text-muted-foreground">
                {line.lineNumber}
              </span>
              <span
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  speakerClassName,
                )}
              >
                {character && (
                  <CharacterAvatar
                    character={character}
                    files={files}
                    className="h-7 w-7 flex-shrink-0"
                  />
                )}
                <span
                  className="truncate text-xs font-bold"
                  style={{
                    color: character?.color ?? "var(--color-muted-foreground)",
                  }}
                >
                  {speaker}
                </span>
              </span>
              <span
                className="truncate text-foreground"
                title={line.text ?? line.target ?? line.raw}
              >
                {line.text ?? line.target ?? line.raw}
              </span>
              <span className="flex min-w-4 justify-end gap-1">
                {badges}
                {isSearchMatch && (
                  <span
                    className="h-2 w-2 rounded-full bg-info"
                    title="搜索命中"
                  />
                )}
                {!badges && dirty && (
                  <span className="h-2 w-2 rounded-full bg-warning" />
                )}
              </span>
            </button>
          );
        })}
      </div>
      {menu &&
        rowContextMenu &&
        createPortal(
          <LineRowMenu
            x={menu.x}
            y={menu.y}
            line={menu.line}
            actions={rowContextMenu}
            onRun={runRowAction}
          />,
          document.body,
        )}
    </div>
  );
}

export function ScriptLineWorkbench({
  lines,
  selectedLine,
  selectedLineKeys,
  onSelectLine,
  characters,
  files,
  draftText,
  draftSpeakerId,
  dirty,
  isBusy,
  onChangeText,
  onChangeSpeaker,
  onSaveLine,
  onInsertLine,
  onDeleteLine,
  onCopy,
  canSaveLine,
  highlightDirty,
  renderLineBadges,
  emptyTitle,
  emptyDescription,
  className,
  listClassName,
  showOperationPanel = true,
  searchMatchLineKeys,
}: {
  lines: RpyLine[];
  selectedLine?: RpyLine;
  selectedLineKeys?: Set<string>;
  onSelectLine: (
    line: RpyLine,
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  characters: CharacterRegistryItem[];
  files?: FileEntry[];
  draftText: string;
  draftSpeakerId: string | null;
  dirty: boolean;
  isBusy: boolean;
  onChangeText: (value: string) => void;
  onChangeSpeaker: (speakerId: string | null) => void;
  onSaveLine: (line?: RpyLine) => void;
  onInsertLine: (position: InsertPosition, line?: RpyLine) => void;
  onDeleteLine: (line?: RpyLine) => void;
  onCopy: (value: string, label: string) => void;
  canSaveLine: (line: RpyLine) => boolean;
  highlightDirty?: (line: RpyLine) => boolean;
  renderLineBadges?: (line: RpyLine) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  listClassName?: string;
  showOperationPanel?: boolean;
  searchMatchLineKeys?: Set<string>;
}) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1">
        {lines.length > 0 ? (
          <LineList
            lines={lines}
            selectedLine={selectedLine}
            selectedLineKeys={selectedLineKeys}
            onSelectLine={onSelectLine}
            rowContextMenu={{
              isBusy,
              canSaveLine,
              onSaveLine,
              onInsertLine: (line, position) => onInsertLine(position, line),
              onDeleteLine,
              onCopyLine: (line) => onCopy(line.raw, "原始行"),
            }}
            characters={characters}
            files={files}
            highlightDirty={highlightDirty}
            renderLineBadges={renderLineBadges}
            emptyTitle={emptyTitle}
            className={listClassName}
            searchMatchLineKeys={searchMatchLineKeys}
          />
        ) : (
          <EmptyState
            title={emptyTitle ?? "暂无可编辑行"}
            description={emptyDescription}
          />
        )}
      </div>
      {showOperationPanel && (
        <LineOperationPanel
          line={selectedLine}
          characters={characters}
          files={files}
          draftText={draftText}
          draftSpeakerId={draftSpeakerId}
          dirty={dirty}
          isBusy={isBusy}
          onChangeText={onChangeText}
          onChangeSpeaker={onChangeSpeaker}
          onSaveLine={() => onSaveLine()}
          onInsertLine={(position) => onInsertLine(position)}
          onDeleteLine={() => onDeleteLine()}
          onCopy={onCopy}
        />
      )}
    </div>
  );
}

interface LineRowContextMenu {
  isBusy: boolean;
  canSaveLine?: (line: RpyLine) => boolean;
  onSaveLine?: (line: RpyLine) => void;
  onInsertLine?: (line: RpyLine, position: InsertPosition) => void;
  onDeleteLine?: (line: RpyLine) => void;
  onCopyLine?: (line: RpyLine) => void;
}

function LineRowMenu({
  x,
  y,
  line,
  actions,
  onRun,
}: {
  x: number;
  y: number;
  line: RpyLine;
  actions: LineRowContextMenu;
  onRun: (action: () => void, enabled?: boolean) => void;
}) {
  const canOperate = !actions.isBusy;
  const canSave = canOperate && Boolean(actions.canSaveLine?.(line));

  return (
    <div
      className="fixed z-[70] min-w-44 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm shadow-xl"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <ContextMenuButton
        label="保存行"
        shortcut="Ctrl+S"
        disabled={!canSave}
        onClick={() => onRun(() => actions.onSaveLine?.(line), canSave)}
      />
      <ContextMenuButton
        label="上方插入"
        disabled={!canOperate || !actions.onInsertLine}
        onClick={() =>
          onRun(() => actions.onInsertLine?.(line, "before"), canOperate)
        }
      />
      <ContextMenuButton
        label="下方插入"
        disabled={!canOperate || !actions.onInsertLine}
        onClick={() =>
          onRun(() => actions.onInsertLine?.(line, "after"), canOperate)
        }
      />
      <ContextMenuButton
        label="复制原始行"
        disabled={!actions.onCopyLine}
        onClick={() =>
          onRun(() => actions.onCopyLine?.(line), Boolean(actions.onCopyLine))
        }
      />
      <ContextMenuButton
        label="删除行"
        danger
        disabled={!canOperate || !actions.onDeleteLine}
        onClick={() => onRun(() => actions.onDeleteLine?.(line), canOperate)}
      />
    </div>
  );
}

export function LineOperationPanel({
  line,
  characters,
  files,
  draftText,
  draftSpeakerId,
  dirty,
  isBusy,
  onChangeText,
  onChangeSpeaker,
  onSaveLine,
  onInsertLine,
  onDeleteLine,
  onCopy,
}: {
  line?: RpyLine;
  characters: CharacterRegistryItem[];
  files?: FileEntry[];
  draftText: string;
  draftSpeakerId: string | null;
  dirty: boolean;
  isBusy: boolean;
  onChangeText: (value: string) => void;
  onChangeSpeaker: (speakerId: string | null) => void;
  onSaveLine: () => void;
  onInsertLine: (position: InsertPosition) => void;
  onDeleteLine: () => void;
  onCopy: (value: string, label: string) => void;
}) {
  const character = draftSpeakerId
    ? characters.find((item) => item.id === draftSpeakerId)
    : undefined;
  const canEditText = Boolean(line?.editable);
  const canEditSpeaker = Boolean(
    line?.editable && (line.kind === "dialogue" || line.kind === "narration"),
  );
  const canSave = Boolean(dirty && line?.editable && !isBusy);
  const canOperate = Boolean(line && !isBusy);
  const textValue = line?.editable ? draftText : (line?.raw ?? "");

  return (
    <div className="border-t border-border bg-card p-3">
      <OriginalLineCode line={line} className="mb-2" />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {line ? (
          <>
            <Badge variant="info">行 {line.lineNumber}</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {line.kind}
            </span>
            {!line.editable && <Badge>只读文本</Badge>}
            {dirty && <Badge variant="warning">未保存</Badge>}
          </>
        ) : (
          <Badge>未选择行</Badge>
        )}
        <label className="ml-auto flex min-w-48 items-center gap-2 text-xs">
          <span className="text-muted-foreground">角色</span>
          <select
            value={draftSpeakerId ?? ""}
            onChange={(event) => onChangeSpeaker(event.target.value || null)}
            disabled={!canEditSpeaker || isBusy}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs disabled:opacity-50"
          >
            <option value="">旁白</option>
            {characters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} ({item.id})
              </option>
            ))}
          </select>
        </label>
        {character && (
          <CharacterAvatar
            character={character}
            files={files}
            className="h-8 w-8 flex-shrink-0"
          />
        )}
      </div>
      <textarea
        value={textValue}
        onChange={(event) => onChangeText(event.target.value)}
        disabled={!canEditText || isBusy}
        placeholder={
          line?.editable
            ? "编辑后按 Ctrl+S 保存"
            : line
              ? "当前行只能插入或删除"
              : "请选择一行"
        }
        className="min-h-16 w-full rounded-md border border-border bg-card p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-70"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onSaveLine}
          disabled={!canSave}
          title="保存当前行 (Ctrl+S)"
        >
          <Save className="h-3.5 w-3.5" />
          保存行
          <KeyboardHint>Ctrl+S</KeyboardHint>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onInsertLine("before")}
          disabled={!canOperate}
          title="在当前行上方插入"
        >
          <Plus className="h-3.5 w-3.5" />
          上方插入
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onInsertLine("after")}
          disabled={!canOperate}
          title="在当前行下方插入"
        >
          <Plus className="h-3.5 w-3.5" />
          下方插入
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => line && onCopy(line.raw, "原始行")}
          disabled={!line}
          title="复制原始行"
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDeleteLine}
          disabled={!canOperate}
          title="删除当前行"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除行
        </Button>
      </div>
    </div>
  );
}

export function OriginalLineCode({
  line,
  className,
}: {
  line?: RpyLine;
  className?: string;
}) {
  const value = line ? (line.raw.length > 0 ? line.raw : "空行") : "未选择行";

  return (
    <div
      className={cn(
        "flex min-h-8 min-w-0 items-center gap-2 rounded-md border border-border bg-secondary/70",
        className,
      )}
    >
      <code
        className="min-w-0 flex-1 truncate whitespace-pre font-mono text-xs text-foreground"
        title={line?.raw ?? ""}
      >
        {value}
      </code>
    </div>
  );
}

export function KeyboardHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
      {children}
    </kbd>
  );
}

function ContextMenuButton({
  label,
  shortcut,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40",
        danger && "text-destructive",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function useVirtualWindow(
  count: number,
  rowHeight: number,
  overscan: number,
  containerRef: RefObject<HTMLElement | null>,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setViewportHeight(node.clientHeight);
    const observer = new ResizeObserver(() => {
      setViewportHeight(node.clientHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  const visibleCount = Math.ceil(
    (viewportHeight || rowHeight * 12) / rowHeight,
  );
  const start = Math.min(
    count,
    Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
  );
  const end = Math.min(count, start + visibleCount + overscan * 2);

  return {
    start,
    end,
    totalHeight: count * rowHeight,
    onScroll: (event: UIEvent<HTMLElement>) => {
      setScrollTop(event.currentTarget.scrollTop);
    },
  };
}

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-32 flex-col items-center justify-center gap-1 p-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function DetailRow({
  label,
  value,
  monospace = true,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "max-w-[65%] truncate text-right text-xs font-medium",
          monospace ? "font-mono" : "",
        )}
        title={value}
      >
        {value}
      </strong>
    </div>
  );
}

export function CharacterAvatar({
  character,
  files = [],
  className,
}: {
  character: CharacterRegistryItem;
  files?: FileEntry[];
  className?: string;
}) {
  return (
    <StateThumbnail
      state={characterPreviewState(character)}
      character={character}
      files={files}
      className={className}
      imageClassName="rounded-full"
    />
  );
}

export function StateThumbnail({
  state,
  character,
  files = [],
  className,
  imageClassName,
}: {
  state?: CharacterState;
  character?: Pick<CharacterRegistryItem, "color">;
  files?: FileEntry[];
  className?: string;
  imageClassName?: string;
}) {
  const file = state?.path ? findImageFile(files, state.path) : undefined;

  if (file) {
    return (
      <ImageFileThumb
        file={file}
        className={className}
        imageClassName={imageClassName}
      />
    );
  }

  return (
    <span
      className={cn(
        "block rounded-md border border-border bg-secondary",
        className,
      )}
      style={{
        background: `linear-gradient(180deg, ${character?.color ?? "#64748b"}30, var(--color-secondary))`,
      }}
      title={state?.imageTag}
    />
  );
}

export function ImageFileThumb({
  file,
  className,
  imageClassName,
  enableLightbox = true,
  checkerboard = false,
  zoom = 1,
}: {
  file: FileEntry;
  className?: string;
  imageClassName?: string;
  enableLightbox?: boolean;
  checkerboard?: boolean;
  zoom?: number;
}) {
  const [preview, setPreview] = useState<{
    url: string;
    isThumbnail: boolean;
  }>();
  const [open, setOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getImagePreviewUrl(file)
      .then((next) => {
        if (mounted.current) setPreview(next);
        else URL.revokeObjectURL(next.url);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  return (
    <>
      <span
        role={enableLightbox ? "button" : undefined}
        tabIndex={enableLightbox ? 0 : undefined}
        className={cn(
          "grid place-items-center overflow-hidden rounded-md border border-border",
          checkerboard ? "checkerboard-bg" : "bg-secondary",
          enableLightbox &&
            "cursor-zoom-in transition-colors hover:border-info",
          className,
        )}
        onClick={(event) => {
          if (!enableLightbox || !preview) return;
          event.stopPropagation();
          setOpen(true);
        }}
        onDoubleClick={(event) => {
          if (enableLightbox && preview) event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (!enableLightbox || !preview) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        {preview && (
          <img
            src={preview.url}
            alt={file.name}
            className={cn(
              "max-h-full max-w-full object-contain transition-transform",
              imageClassName,
            )}
            style={{
              transform: zoom === 1 ? undefined : `scale(${zoom})`,
            }}
          />
        )}
      </span>
      {open &&
        preview &&
        createPortal(
          <ImageLightbox
            file={file}
            url={preview.url}
            initialCheckerboard={checkerboard}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

export function ImagePreview({
  file,
  className,
}: {
  file: FileEntry;
  className?: string;
}) {
  const [zoom, setZoom] = useState(100);
  const [checkerboard, setCheckerboard] = useState(true);

  return (
    <figure className={cn("m-0 mt-3", className)}>
      <PreviewZoomControls
        zoom={zoom}
        checkerboard={checkerboard}
        onZoomChange={setZoom}
        onCheckerboardChange={setCheckerboard}
        className="mb-2"
      />
      <ImageFileThumb
        file={file}
        className="min-h-40 w-full p-2"
        imageClassName="max-h-[60vh]"
        checkerboard={checkerboard}
        zoom={zoom / 100}
      />
      <figcaption className="mt-1.5 break-all text-[11px] text-muted-foreground">
        {file.path} · {formatBytes(file.size)}
      </figcaption>
    </figure>
  );
}

function PreviewZoomControls({
  zoom,
  checkerboard,
  onZoomChange,
  onCheckerboardChange,
  className,
}: {
  zoom: number;
  checkerboard: boolean;
  onZoomChange: (zoom: number) => void;
  onCheckerboardChange: (enabled: boolean) => void;
  className?: string;
}) {
  function setNextZoom(next: number) {
    onZoomChange(Math.min(300, Math.max(50, next)));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setNextZoom(zoom - 25)}
        disabled={zoom <= 50}
        title="缩小"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <label className="flex min-w-40 flex-1 items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{zoom}%</span>
        <input
          type="range"
          min={50}
          max={300}
          step={25}
          value={zoom}
          onChange={(event) => setNextZoom(Number(event.target.value))}
          className="min-w-0 flex-1"
          aria-label="预览缩放比例"
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setNextZoom(zoom + 25)}
        disabled={zoom >= 300}
        title="放大"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setNextZoom(100)}
        disabled={zoom === 100}
        title="重置缩放"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant={checkerboard ? "default" : "outline"}
        size="sm"
        onClick={() => onCheckerboardChange(!checkerboard)}
        title="切换透明棋盘背景"
      >
        <Grid2x2 className="h-3.5 w-3.5" />
        棋盘
      </Button>
    </div>
  );
}

export function AudioPreview({ file }: { file: FileEntry }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    file.handle
      .getFile()
      .then((blob) => {
        const next = URL.createObjectURL(blob);
        if (active) setUrl(next);
        else URL.revokeObjectURL(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <figure className="m-0 mt-3 grid gap-2 rounded-md border border-border bg-secondary p-3">
      {url ? (
        <audio controls src={url} className="w-full" />
      ) : (
        <div className="grid h-16 place-items-center text-xs text-muted-foreground">
          载入音频中
        </div>
      )}
      <figcaption className="break-all text-[11px] text-muted-foreground">
        {file.path} · {formatBytes(file.size)}
      </figcaption>
    </figure>
  );
}

export function FileSidebar({
  query,
  setQuery,
  files,
  selectedPath,
  selectedLine,
  onSelectFile,
  fileLines,
  characters,
  dirtyByFile,
}: {
  query: string;
  setQuery: (query: string) => void;
  files: FileEntry[];
  selectedPath?: string;
  selectedLine?: RpyLine;
  onSelectFile: (path: string, line?: RpyLine) => void;
  fileLines: Record<string, RpyLine[]>;
  characters: CharacterRegistryItem[];
  dirtyByFile?: Set<string>;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );
  const searchMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    return files.flatMap((file) => {
      const lines = fileLines[file.path] ?? [];
      const fileMatches =
        file.path.toLowerCase().includes(normalizedQuery) ||
        file.name.toLowerCase().includes(normalizedQuery);
      const matches: { id: string; file: FileEntry; line?: RpyLine }[] = [];
      if (fileMatches) matches.push({ id: `file:${file.path}`, file });
      for (const line of lines) {
        if (!isFileIndexSearchableLine(line)) continue;
        const speakerName = line.characterId
          ? characterById.get(line.characterId)?.displayName
          : undefined;
        if (lineMatchesQuery(line, normalizedQuery, speakerName)) {
          matches.push({ id: lineKey(line), file, line });
        }
      }
      return matches;
    });
  }, [characterById, fileLines, files, normalizedQuery]);
  const searchMatchPaths = useMemo(
    () => new Set(searchMatches.map((match) => match.file.path)),
    [searchMatches],
  );
  const activeLineKey = selectedLine ? lineKey(selectedLine) : undefined;
  const activeLineSearchIndex = activeLineKey
    ? searchMatches.findIndex((match) => match.id === activeLineKey)
    : -1;
  const activeFileSearchIndex = selectedPath
    ? searchMatches.findIndex(
        (match) => !match.line && match.file.path === selectedPath,
      )
    : -1;
  const activeSearchIndex =
    activeLineSearchIndex >= 0 ? activeLineSearchIndex : activeFileSearchIndex;
  const searchPosition = activeSearchIndex + 1;

  function navigateSearchMatch(delta: 1 | -1) {
    if (searchMatches.length === 0) return;
    if (activeSearchIndex >= 0) {
      const nextIndex =
        (activeSearchIndex + delta + searchMatches.length) %
        searchMatches.length;
      const match = searchMatches[nextIndex];
      onSelectFile(match.file.path, match.line);
      return;
    }

    const currentFileIndex = selectedPath
      ? files.findIndex((file) => file.path === selectedPath)
      : -1;
    const indexedMatches = searchMatches.map((match) => ({
      ...match,
      fileIndex: files.findIndex((file) => file.path === match.file.path),
      lineNumber: match.line?.lineNumber ?? 0,
    }));
    const currentLineNumber = selectedLine?.lineNumber ?? 0;
    const previousMatch = [...indexedMatches]
      .reverse()
      .find(
        (match) =>
          match.fileIndex < currentFileIndex ||
          (match.fileIndex === currentFileIndex &&
            match.lineNumber < currentLineNumber),
      );
    const nextMatch =
      delta > 0
        ? (indexedMatches.find(
            (match) =>
              match.fileIndex > currentFileIndex ||
              (match.fileIndex === currentFileIndex &&
                match.lineNumber > currentLineNumber),
          ) ?? indexedMatches[0])
        : (previousMatch ?? indexedMatches[indexedMatches.length - 1]);
    if (nextMatch) onSelectFile(nextMatch.file.path, nextMatch.line);
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-card">
      <div className="space-y-2 border-b border-border p-3">
        <p className="text-xs font-bold">文件索引</p>
        <div className="flex items-center gap-1">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            placeholder="搜索 .rpy / label / 角色 / 正文"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateSearchMatch(-1)}
            disabled={searchMatches.length === 0}
            title="上一个搜索命中"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateSearchMatch(1)}
            disabled={searchMatches.length === 0}
            title="下一个搜索命中"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {files.length === 0
            ? "打开工作区后显示脚本文件"
            : `${files.length} 个 .rpy · ${characters.length} 角色${
                normalizedQuery
                  ? ` · ${searchPosition > 0 ? `${searchPosition}/` : ""}${searchMatches.length} 命中`
                  : ""
              }`}
        </p>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {files.map((file) => {
          const lines = fileLines[file.path] ?? [];
          const labelCount = lines.filter(
            (line) => line.kind === "label",
          ).length;
          const editableCount = lines.filter((line) => line.editable).length;
          const dirty = dirtyByFile?.has(file.path);
          const isSelected = file.path === selectedPath;
          const isSearchMatch = searchMatchPaths.has(file.path);
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              className={cn(
                "relative flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left transition-colors hover:bg-secondary",
                isSearchMatch && "bg-info/10",
                isSelected && "bg-accent",
              )}
              title={file.path}
            >
              {dirty && (
                <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-r bg-warning" />
              )}
              <strong className="w-full truncate text-xs">{file.name}</strong>
              <span className="w-full truncate text-[11px] text-muted-foreground">
                {labelCount} labels · {editableCount} 行 ·{" "}
                {formatBytes(file.size)}
                {isSearchMatch && " · 搜索命中"}
              </span>
            </button>
          );
        })}
        {files.length === 0 && <EmptyState title="打开工作区后显示脚本文件" />}
      </div>
    </aside>
  );
}

export function Toolbar({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold" title={title}>
          {title}
        </h2>
        {subtitle && (
          <p
            className="truncate text-[11px] text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function LineJumpButton({
  filePath,
  lineNumber,
  onJump,
  label = "跳转",
  className,
}: {
  filePath?: string;
  lineNumber?: number;
  onJump: (filePath: string, lineNumber: number) => void;
  label?: string;
  className?: string;
}) {
  if (!filePath || !lineNumber) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => onJump(filePath, lineNumber)}
      title={`${filePath}:${lineNumber}`}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
      <span className="max-w-48 truncate font-mono text-[11px] text-muted-foreground">
        {filePath}:{lineNumber}
      </span>
    </Button>
  );
}

function findImageFile(files: FileEntry[], imagePath: string) {
  const wanted = normalizePathKey(imagePath);
  return files.find((file) => {
    const path = normalizePathKey(file.path);
    return path === wanted || path.endsWith(`/${wanted}`);
  });
}

function isFileIndexSearchableLine(line: RpyLine) {
  return (
    line.editable ||
    line.kind === "show" ||
    line.kind === "scene" ||
    line.kind === "label" ||
    line.kind === "menu"
  );
}

function ImageLightbox({
  file,
  url,
  initialCheckerboard,
  onClose,
}: {
  file: FileEntry;
  url: string;
  initialCheckerboard: boolean;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [checkerboard, setCheckerboard] = useState(initialCheckerboard);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((current) => Math.min(300, current + 25));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom((current) => Math.max(50, current - 25));
      } else if (event.key === "0") {
        event.preventDefault();
        setZoom(100);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <figure
        className="m-0 flex max-h-full max-w-full flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            "grid max-h-[calc(100vh-7.5rem)] max-w-[calc(100vw-2rem)] place-items-center overflow-hidden rounded-lg bg-black/40",
            checkerboard && "checkerboard-bg",
          )}
        >
          <img
            src={url}
            alt={file.name}
            className="max-h-[calc(100vh-7.5rem)] max-w-[calc(100vw-2rem)] object-contain transition-transform"
            style={{
              transform: zoom === 100 ? undefined : `scale(${zoom / 100})`,
            }}
          />
        </div>
        <figcaption className="grid max-w-[calc(100vw-2rem)] gap-2 rounded-md bg-card px-3 py-2 text-xs text-muted-foreground shadow-xl">
          <PreviewZoomControls
            zoom={zoom}
            checkerboard={checkerboard}
            onZoomChange={setZoom}
            onCheckerboardChange={setCheckerboard}
          />
          <span className="truncate">
            {file.path} · {formatBytes(file.size)}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
