// 고른 것에 하는 편집 동작. 단축키(useShortcuts)와 오른쪽 클릭 메뉴(ContextMenu)가 함께 쓴다.
// 고정된 것은 골라서 볼 수는 있지만 옮기기·돌리기·뒤집기·지우기에서는 빠진다(풀기만 된다).
import {
  addSceneAfter,
  clipIsEmpty,
  copyItems,
  duplicateItems,
  flipItems,
  groupItems,
  isLocked,
  moveItems,
  pasteItems,
  removeItems,
  rotateObjects,
  rotateZones,
  setLocked,
  type Clip,
  ungroupItems,
} from '../model/ops';
import { selectedObjIds, useEditor } from './store';

/** 복사해 둔 것. 붙여 넣을 때마다 조금씩 비켜 놓는다. 다른 설명판을 열어도 남아 있다. */
const clipboard: { clip: Clip | null; pastes: number } = { clip: null, pastes: 0 };

export const ROTATE_STEP = Math.PI / 12; // 15°

const st = () => useEditor.getState();

/** 고른 것 중 고정 안 된 것 */
export function unlockedSel(): string[] {
  const { activity, sel } = st();
  return sel.filter((id) => !isLocked(activity, id));
}

export function canPaste(): boolean {
  return !clipIsEmpty(clipboard.clip);
}

export function copySel(cut = false) {
  const s = st();
  if (!s.sel.length) return;
  clipboard.clip = copyItems(s.activity, s.sceneIdx, s.sel);
  clipboard.pastes = cut ? -1 : 0; // 잘라 낸 것은 첫 붙여넣기를 제자리에
  if (cut) deleteSel();
}

export function paste() {
  const s = st();
  if (!canPaste()) return;
  clipboard.pastes += 1;
  const g = s.grid;
  const unit = g.snap ? g.size * Math.max(1, Math.ceil(0.6 / g.size)) : 0.6;
  const res = pasteItems(s.activity, clipboard.clip!, unit * clipboard.pastes);
  s.commit(res.activity);
  s.setSel(res.ids);
}

/** 오른쪽 클릭한 바닥 자리에 붙여넣기: 붙여 넣은 것들의 한가운데가 그 자리에 오게 */
export function pasteAt(x: number, z: number) {
  const s = st();
  if (!canPaste()) return;
  const res = pasteItems(s.activity, clipboard.clip!, 0);
  const a = res.activity;
  const pts: [number, number][] = [];
  for (const id of res.ids) {
    const p = a.scenes[s.sceneIdx].poses[id];
    if (p) pts.push([p.x, p.z]);
    const zn = a.field.zones.find((v) => v.id === id);
    if (zn) pts.push([zn.x, zn.z]);
    const l = a.field.lines.find((v) => v.id === id);
    if (l) pts.push([(l.x1 + l.x2) / 2, (l.z1 + l.z2) / 2]);
  }
  if (!pts.length) return;
  const cx = pts.reduce((v, p) => v + p[0], 0) / pts.length;
  const cz = pts.reduce((v, p) => v + p[1], 0) / pts.length;
  s.commit(moveItems(a, s.sceneIdx, res.ids, x - cx, z - cz));
  s.setSel(res.ids);
}

export function duplicateSel() {
  const s = st();
  if (!s.sel.length) return;
  const res = duplicateItems(s.activity, s.sel);
  s.commit(res.activity);
  s.setSel(res.ids);
}

/** 지우기: 고정된 것은 남긴다(경기장 선 틀 같은 것을 실수로 지우지 않게) */
export function deleteSel() {
  const s = st();
  const ids = unlockedSel();
  if (!ids.length) return;
  s.commit(removeItems(s.activity, s.sceneIdx, ids));
  s.setSel(s.sel.filter((id) => !ids.includes(id)));
}

export function groupSel(group: boolean) {
  const s = st();
  if (!s.sel.length) return;
  s.commit(group ? groupItems(s.activity, s.sel) : ungroupItems(s.activity, s.sel));
}

export function lockSel(locked: boolean) {
  const s = st();
  if (!s.sel.length) return;
  s.commit(setLocked(s.activity, s.sel, locked));
}

export function flipSel(axis: 'x' | 'z') {
  const s = st();
  const ids = unlockedSel();
  if (ids.length) s.commit(flipItems(s.activity, s.sceneIdx, ids, axis));
}

/** dir 1 = 왼쪽(반시계), -1 = 오른쪽. 물건은 보는 방향, 구역은 모양이 돈다. */
export function rotateSel(dir: 1 | -1) {
  const s = st();
  const free = unlockedSel();
  const objs = selectedObjIds(free, s.activity);
  const zones = free.filter((id) => s.activity.field.zones.some((z) => z.id === id));
  if (!objs.length && !zones.length) return;
  let next = s.activity;
  if (objs.length) next = rotateObjects(next, s.sceneIdx, objs, dir * ROTATE_STEP);
  if (zones.length) next = rotateZones(next, zones, dir * ROTATE_STEP);
  s.commit(next, 'rotate-key');
}

export function nudgeSel(dx: number, dz: number) {
  const s = st();
  const ids = unlockedSel();
  if (ids.length) s.commit(moveItems(s.activity, s.sceneIdx, ids, dx, dz), 'nudge');
}

/** 모두 선택: 지금 장면에 보이는 것 중 고정 안 된 것 전부(물건·구역·선·화살표·말풍선) */
export function selectAll() {
  const s = st();
  const a = s.activity;
  const scene = a.scenes[s.sceneIdx];
  const ids = [
    ...a.objects.filter((o) => !o.locked && scene.poses[o.id]).map((o) => o.id),
    ...a.field.zones.filter((z) => !z.locked).map((z) => z.id),
    ...a.field.lines.filter((l) => !l.locked).map((l) => l.id),
    ...scene.arrows.map((v) => v.id),
    ...scene.bubbles.map((v) => v.id),
  ];
  s.setTool({ t: 'select' });
  s.setSel(ids);
  if (ids.length) s.setRightTab('props');
}

/**
 * Tab·Shift+Tab: 다음·이전 것을 하나씩 고른다(PPT처럼). 물건 → 구역 → 선 순서, 고정된 것도 포함.
 * 묶음은 묶음째 건너뛴다.
 */
export function cycleSel(dir: 1 | -1) {
  const s = st();
  const a = s.activity;
  const scene = a.scenes[s.sceneIdx];
  const order = [...a.objects.filter((o) => scene.poses[o.id]), ...a.field.zones, ...a.field.lines];
  if (!order.length) return;
  // 묶음은 첫 것만 남긴다
  const seen = new Set<string>();
  const stops = order.filter((i) => {
    if (!i.groupId) return true;
    if (seen.has(i.groupId)) return false;
    seen.add(i.groupId);
    return true;
  });
  const cur = stops.findIndex((i) => s.sel.includes(i.id));
  const next = stops[(cur < 0 ? (dir > 0 ? 0 : stops.length - 1) : cur + dir + stops.length) % stops.length];
  const ids = next.groupId ? order.filter((i) => i.groupId === next.groupId).map((i) => i.id) : [next.id];
  s.setSel(ids);
  s.setRightTab('props');
}

/** Ctrl+M: 지금 장면 뒤에 새 장면(애니메이션이 끝난 자리에서 시작) */
export function newScene() {
  const s = st();
  const res = addSceneAfter(s.activity, s.sceneIdx, 'end');
  s.commit(res.activity);
  s.setSceneIdx(res.idx);
}

/** F2: 고른 것의 이름(이름표·구역/선 이름·말풍선 글)을, 안 골랐으면 활동 이름을 고치는 칸으로 */
export function focusRename() {
  const s = st();
  s.setRightTab('props');
  // 속성 탭이 그려진 다음에 칸을 찾는다
  requestAnimationFrame(() => {
    const ids = s.sel.length ? ['obj-label', 'zone-label', 'line-label', 'bubble-text'] : ['act-title'];
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) {
        el.focus();
        el.select();
        return;
      }
    }
  });
}
