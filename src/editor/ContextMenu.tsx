import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CATALOG_BY_KIND } from '../model/catalog';
import {
  addBubble,
  expandGroups,
  isLocked,
  lockedCount,
  toggleHighlight,
  unlockAll,
  updateObjects,
} from '../model/ops';
import {
  canPaste,
  copySel,
  deleteSel,
  duplicateSel,
  flipSel,
  focusRename,
  groupSel,
  lockSel,
  newScene,
  paste,
  pasteAt,
  rotateSel,
  selectAll,
} from './actions';
import { gridSnap } from './Interaction';
import { useEditor } from './store';

// 오른쪽 클릭 빠른 메뉴. 3D 화면에서 오른쪽 버튼을 누른 채 끌면 화면이 옮겨지므로(OrbitControls),
// 누른 자리에서 손을 뗄 때만 메뉴를 연다. 무엇을 눌렀는지는 3D 쪽 pointerdown이 noteRightPress로 알려 준다.

type Target = { id: string } | { floor: [number, number] | null };
const press: { x: number; y: number; target: Target | undefined } = { x: 0, y: 0, target: undefined };

export function noteRightPress(t: Target) {
  press.target = t;
}

/** 작업판(main)의 pointerdown(capture): 3D 쪽 처리보다 먼저 누른 자리를 적는다 */
export function onStagePointerDownCapture(e: React.PointerEvent) {
  if (e.button !== 2) return;
  press.x = e.clientX;
  press.y = e.clientY;
  press.target = undefined;
}

export function onStageContextMenu(e: React.MouseEvent) {
  e.preventDefault();
  const st = useEditor.getState();
  if (st.playing || st.dragging) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) return; // 끌어서 화면을 옮긴 것
  if (st.tool.t !== 'select') st.setTool({ t: 'select' });
  const t = press.target;
  let floor: [number, number] | null = null;
  if (t && 'id' in t) {
    // 고른 것 위에서 누르면 고른 것 그대로, 아니면 누른 것(묶음째)만 고른다
    if (!st.sel.includes(t.id)) st.setSel(expandGroups(st.activity, [t.id]));
  } else if (t) {
    st.setSel([]);
    floor = t.floor;
  }
  st.setMenu({ x: e.clientX, y: e.clientY, floor });
}

interface Item {
  label: string;
  keys?: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function ContextMenu() {
  const menu = useEditor((s) => s.menu);
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const sel = useEditor((s) => s.sel);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 화면 밖으로 넘치지 않게 자리를 맞춘다
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      useEditor.getState().setMenu(null);
    };
    const closeNow = () => useEditor.getState().setMenu(null);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', closeNow, true);
    window.addEventListener('blur', closeNow);
    window.addEventListener('resize', closeNow);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', closeNow, true);
      window.removeEventListener('blur', closeNow);
      window.removeEventListener('resize', closeNow);
    };
  }, [menu]);

  if (!menu) return null;

  const st = useEditor.getState;
  const commit = (fn: (a: typeof activity) => typeof activity) => st().commit(fn(st().activity));
  const scene = activity.scenes[sceneIdx];
  const objs = activity.objects.filter((o) => sel.includes(o.id));
  const onlyObjs = sel.length > 0 && objs.length === sel.length;
  const arrangeable = [...activity.objects, ...activity.field.zones, ...activity.field.lines].filter((i) =>
    sel.includes(i.id),
  );
  const allLocked = arrangeable.length > 0 && arrangeable.every((i) => i.locked);
  const anyUnlocked = sel.some((id) => !isLocked(activity, id));
  const groups = new Set(arrangeable.map((i) => i.groupId));
  const oneGroup = arrangeable.length > 1 && groups.size === 1 && !groups.has(undefined);
  const anyGrouped = arrangeable.some((i) => i.groupId);
  const teamColored = onlyObjs && objs.every((o) => CATALOG_BY_KIND[o.kind].teamColored);
  const single = sel.length === 1;
  const renamable =
    single &&
    ((objs[0]?.kind === 'kid') ||
      activity.field.zones.some((z) => z.id === sel[0]) ||
      activity.field.lines.some((l) => l.id === sel[0]) ||
      scene.bubbles.some((b) => b.id === sel[0]));
  const highlighted = onlyObjs && sel.every((id) => scene.highlights.includes(id));

  const groupsOf: Item[][] = [];
  if (sel.length) {
    groupsOf.push([
      { label: '잘라내기', keys: 'Ctrl+X', run: () => copySel(true), disabled: !anyUnlocked },
      { label: '복사', keys: 'Ctrl+C', run: () => copySel() },
      { label: '붙여넣기', keys: 'Ctrl+V', run: paste, disabled: !canPaste() },
      { label: '복제', keys: 'Ctrl+D', run: duplicateSel },
      { label: allLocked ? '지우기 (고정을 풀어야 지워집니다)' : '지우기', keys: 'Delete', run: deleteSel, disabled: !anyUnlocked, danger: true },
    ]);
    const arrange: Item[] = [];
    if (arrangeable.length)
      arrange.push({ label: allLocked ? '고정 풀기' : '고정하기', run: () => lockSel(!allLocked) });
    if (arrangeable.length > 1 && !oneGroup) arrange.push({ label: '하나로 묶기', keys: 'Ctrl+G', run: () => groupSel(true) });
    if (anyGrouped) arrange.push({ label: '묶음 풀기', keys: 'Ctrl+Shift+G', run: () => groupSel(false) });
    if (arrange.length) groupsOf.push(arrange);
    if (anyUnlocked) {
      const turn: Item[] = [];
      if (objs.some((o) => !o.locked)) {
        turn.push({ label: '왼쪽으로 15° 돌리기', keys: 'Q', run: () => rotateSel(1) });
        turn.push({ label: '오른쪽으로 15° 돌리기', keys: 'E', run: () => rotateSel(-1) });
      }
      turn.push({ label: '좌우 뒤집기', keys: 'H', run: () => flipSel('x') });
      turn.push({ label: '앞뒤 뒤집기', keys: 'V', run: () => flipSel('z') });
      groupsOf.push(turn);
    }
    if (onlyObjs) {
      const anim: Item[] = [];
      const ids = [...sel];
      if (ids.length > 1) {
        anim.push({ label: '모여 이동…', run: () => st().setTool({ t: 'path', ids, mode: 'gather' }) });
        anim.push({ label: '대형 유지하며 이동…', run: () => st().setTool({ t: 'path', ids, mode: 'keep' }) });
      } else {
        anim.push({ label: '이동 애니메이션…', run: () => st().setTool({ t: 'path', ids }) });
      }
      anim.push({ label: highlighted ? '강조 끄기' : '강조하기', run: () => commit((a) => toggleHighlight(a, sceneIdx, ids)) });
      if (single)
        anim.push({
          label: '말풍선 달기',
          run: () => {
            const { activity: next, id } = addBubble(st().activity, sceneIdx, { objId: ids[0], text: '' });
            st().commit(next);
            st().setSel([id]);
            focusRename();
          },
        });
      groupsOf.push(anim);
    }
    const look: Item[] = [];
    if (renamable) look.push({ label: '이름 고치기', keys: 'F2', run: focusRename });
    look.push({ label: '속성 보기', run: () => st().setRightTab('props') });
    groupsOf.push(look);
  } else {
    const floor = menu.floor;
    groupsOf.push([
      floor
        ? { label: '여기에 붙여넣기', keys: 'Ctrl+V', run: () => pasteAt(gridSnap(floor[0]), gridSnap(floor[1])), disabled: !canPaste() }
        : { label: '붙여넣기', keys: 'Ctrl+V', run: paste, disabled: !canPaste() },
      { label: '모두 선택', keys: 'Ctrl+A', run: selectAll },
    ]);
    groupsOf.push([{ label: '새 장면', keys: 'Ctrl+M', run: newScene }]);
    if (lockedCount(activity) > 0)
      groupsOf.push([{ label: `모두 고정 풀기 (${lockedCount(activity)}개)`, run: () => commit(unlockAll) }]);
  }

  const run = (it: Item) => {
    if (it.disabled) return;
    st().setMenu(null);
    it.run();
  };

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      style={pos ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {groupsOf.map((g, gi) => (
        <div key={gi} className="ctx-group" role="group">
          {g.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'danger' : undefined}
              disabled={it.disabled}
              onClick={() => run(it)}
            >
              <span>{it.label}</span>
              {it.keys && <kbd>{it.keys}</kbd>}
            </button>
          ))}
        </div>
      ))}
      {teamColored && (
        <div className="ctx-group ctx-teams" role="group" aria-label="팀 바꾸기">
          <span>팀</span>
          {activity.teams.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              title={t.name}
              aria-label={`${t.name}으로 바꾸기`}
              className={`swatch${objs.every((o) => o.teamId === t.id) ? ' on' : ''}`}
              style={{ background: t.color }}
              onClick={() => {
                st().setMenu(null);
                commit((a) => updateObjects(a, sel, { teamId: t.id, color: undefined }));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
