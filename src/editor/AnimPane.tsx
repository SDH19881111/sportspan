import { useMemo, useRef, useState } from 'react';
import type { Activity, Anim, AnimStart, BoardObject, MoveStyle, SoundKind } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import {
  addAnim,
  addVia,
  moveAnim,
  removeItems,
  removeVia,
  reorderAnims,
  setCarry,
  updateAnim,
  updateAnims,
} from '../model/ops';
import { playSound, SOUND_NAMES, unlockAudio } from '../audio/sfx';
import { BALL_R } from '../motion/physics';
import {
  buildTimeline,
  defaultStyle,
  HEIGHTS,
  LANDING_NAMES,
  SPEEDS,
  type TimedAnim,
  type Timeline,
} from '../motion/timeline';
import { useEditor } from './store';

// 애니메이션 창(PPT의 애니메이션 창처럼): 순서, 시작 방식, 지연, 시간 막대.
//  - 막대 가운데를 끌면 지연, 오른쪽 끝을 끌면 길이(빠르기)
//  - 아래 눈금을 누르거나 끌면 그 순간의 모습을 3D 화면에 보여 준다(되감기)
//  - 줄 왼쪽 손잡이(⋮⋮)를 끌어 순서를 바꾼다. Shift·Ctrl로 여러 줄을 고른다.

const START_NAMES: Record<AnimStart, string> = {
  click: '클릭할 때',
  with: '앞과 함께',
  after: '앞 다음에',
  hit: '공이 닿을 때',
};

const KIND_NAMES: Record<Anim['kind'], string> = {
  move: '이동',
  fall: '넘어지기',
  appear: '나타나기',
  disappear: '사라지기',
  highlight: '강조',
  show: '나타나기',
  sound: '효과음',
};

const STYLE_NAMES: Record<MoveStyle, string> = {
  walk: '걷기',
  run: '뛰기',
  roll: '굴러감',
  throw: '던짐',
  bounce: '튀김',
};

const SOUNDS: SoundKind[] = ['whistle', 'bell', 'beep', 'clap'];
const TRACK_INSET = 8; // 줄 안쪽 여백(px): 시간 막대·재생 헤드·눈금을 같은 폭에 맞춘다

/** 목록에 보일 물건 이름: 이름표가 있으면 그것, 없으면 "빨강 팀 학생 3", "콘 2" */
export function objectName(a: Activity, obj: BoardObject): string {
  if (obj.label) return obj.label;
  const same = a.objects.filter((o) => o.kind === obj.kind && o.teamId === obj.teamId);
  const n = same.findIndex((o) => o.id === obj.id) + 1;
  const kind = CATALOG_BY_KIND[obj.kind].name;
  const team = obj.teamId ? a.teams.find((t) => t.id === obj.teamId)?.name : undefined;
  return `${team ? `${team} ` : ''}${kind}${same.length > 1 ? ` ${n}` : ''}`;
}

/** 애니메이션 한 줄의 이름 */
function animTitle(a: Activity, sceneIdx: number, an: Anim): { name: string; color?: string } {
  const scene = a.scenes[sceneIdx];
  if (an.kind === 'sound') return { name: `효과음 · ${SOUND_NAMES[an.sound ?? 'whistle']}` };
  if (an.kind === 'show') {
    const b = scene.bubbles.find((v) => v.id === an.markId);
    if (b) return { name: `말풍선 "${b.text || '…'}" · 나타나기` };
    return { name: '화살표 · 나타나기' };
  }
  const obj = a.objects.find((o) => o.id === an.objId);
  if (!obj) return { name: '(지워진 물건)' };
  let name = `${objectName(a, obj)} · ${KIND_NAMES[an.kind]}`;
  if (an.kind === 'move') name += ` (${STYLE_NAMES[an.style ?? defaultStyle(obj)]})`;
  if (an.carry) name += ' +공';
  return { name, color: colorOf(a, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor };
}

/** 몇 번째 클릭인지(자동으로 시작하는 묶음은 세지 않는다) */
function clickNumber(groups: Timeline['groups'], group: number) {
  return groups.slice(0, group + 1).filter((g) => g.waitsForClick).length;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function AnimPane() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const sel = useEditor((s) => s.sel);
  const playing = useEditor((s) => s.playing);
  const playT = useEditor((s) => s.playT);
  const scrubT = useEditor((s) => s.scrubT);
  const commit = useEditor((s) => s.commit);
  const setSel = useEditor((s) => s.setSel);
  const play = useEditor((s) => s.play);
  const stop = useEditor((s) => s.stop);
  const playRate = useEditor((s) => s.playRate);
  const setPlayRate = useEditor((s) => s.setPlayRate);
  const setScrubT = useEditor((s) => s.setScrubT);
  const [soundMenu, setSoundMenu] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const scene = activity.scenes[sceneIdx];
  const timeline = useMemo(() => buildTimeline(activity, sceneIdx), [activity, sceneIdx]);
  const byId = new Map(timeline.items.filter((it) => !it.carried).map((it) => [it.anim.id, it]));
  const total = Math.max(timeline.duration, 1);
  const chosen = scene.anims.filter((an) => sel.includes(an.id));
  const head = playing ? playT : scrubT;
  const pct = (sec: number) => `calc(${TRACK_INSET}px + (100% - ${TRACK_INSET * 2}px) * ${Math.min(1, sec / total)})`;

  const pickRow = (id: string, e: React.MouseEvent) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) return setSel([id]);
    const animSel = sel.filter((x) => scene.anims.some((an) => an.id === x));
    setSel(animSel.includes(id) ? animSel.filter((x) => x !== id) : [...animSel, id]);
  };

  // ── 막대 끌기: 가운데는 지연, 오른쪽 끝은 길이(빠르기) ──
  const onBarDown = (e: React.PointerEvent<HTMLSpanElement>, an: Anim, it: TimedAnim) => {
    if (e.button !== 0 || playing) return;
    e.stopPropagation();
    e.preventDefault();
    const bar = e.currentTarget.getBoundingClientRect();
    const track = e.currentTarget.parentElement!.getBoundingClientRect();
    const pxPerSec = track.width / total;
    const resize = it.duration > 0.35 && e.clientX > bar.right - 10;
    const st = useEditor.getState();
    if (!sel.includes(an.id)) setSel([an.id]);
    st.beginGesture();
    const base = st.activity;
    const sx = e.clientX;
    const d0 = an.delay;
    const sp0 = an.speed ?? 1;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - sx) / pxPerSec;
      const now = useEditor.getState();
      if (resize) {
        const dur = Math.max(0.1, it.duration + dt);
        const speed = Math.round(Math.min(4, Math.max(0.1, (sp0 * it.duration) / dur)) * 100) / 100;
        now.preview(updateAnim(base, now.sceneIdx, an.id, { speed: speed === 1 ? undefined : speed }));
      } else {
        now.preview(updateAnim(base, now.sceneIdx, an.id, { delay: Math.max(0, round1(d0 + dt)) }));
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useEditor.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── 손잡이 끌기: 순서 바꾸기 ──
  const onGripDown = (e: React.PointerEvent, an: Anim) => {
    if (e.button !== 0 || playing) return;
    e.stopPropagation();
    e.preventDefault();
    const animSel = sel.filter((x) => scene.anims.some((v) => v.id === x));
    const ids = animSel.includes(an.id) ? animSel : [an.id];
    if (!animSel.includes(an.id)) setSel([an.id]);
    const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-anim-row]') ?? [])];
    const indexAt = (y: number) =>
      rows().filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top + b.height / 2 < y;
      }).length;
    let target = indexAt(e.clientY);
    setDropAt(target);
    const move = (ev: PointerEvent) => {
      target = indexAt(ev.clientY);
      setDropAt(target);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDropAt(null);
      const st = useEditor.getState();
      st.commit(reorderAnims(st.activity, st.sceneIdx, ids, target));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── 눈금 누르기·끌기: 되감기 ──
  const onRulerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || playing) return;
    const r = e.currentTarget.getBoundingClientRect();
    const toT = (x: number) =>
      round1(Math.min(total, Math.max(0, ((x - r.left - TRACK_INSET) / (r.width - TRACK_INSET * 2)) * total)));
    setScrubT(toT(e.clientX));
    const move = (ev: PointerEvent) => setScrubT(toT(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const addSound = (sound: SoundKind) => {
    const st = useEditor.getState();
    const after = scene.anims.findIndex((an) => sel.includes(an.id));
    const res = addAnim(st.activity, sceneIdx, {
      kind: 'sound',
      sound,
      start: scene.anims.length ? 'with' : 'click',
      delay: 0,
    });
    // 고른 애니메이션 바로 뒤에 넣는다
    const next = after >= 0 ? reorderAnims(res.activity, sceneIdx, [res.id], after + 1) : res.activity;
    st.commit(next);
    setSel([res.id]);
    setSoundMenu(false);
  };

  return (
    <div className="anim-pane">
      <div className="anim-head">
        <h2>장면 {sceneIdx + 1} 애니메이션</h2>
        <div className="anim-head-tools">
          <select
            id="play-rate"
            aria-label="재생 빠르기"
            title="재생 빠르기(모든 애니메이션)"
            value={playRate}
            onChange={(e) => setPlayRate(parseFloat(e.target.value))}
          >
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {v}배
              </option>
            ))}
          </select>
          {playing ? (
            <button className="play on" onClick={stop}>
              ■ 멈추기
            </button>
          ) : (
            <button
              className="play"
              disabled={!scene.anims.length}
              onClick={() => {
                unlockAudio();
                play(sceneIdx, false);
              }}
              title="Space"
            >
              ▶ 재생
            </button>
          )}
        </div>
      </div>

      <div className="anim-sound">
        <button className="ghost" onClick={() => setSoundMenu((v) => !v)} aria-expanded={soundMenu}>
          ＋ 효과음
        </button>
        {soundMenu && (
          <div className="sound-menu" role="menu">
            {SOUNDS.map((k) => (
              <div key={k} className="sound-row">
                <button
                  className="icon"
                  title="미리 듣기"
                  aria-label={`${SOUND_NAMES[k]} 미리 듣기`}
                  onClick={() => playSound(k)}
                >
                  ▶
                </button>
                <button role="menuitem" onClick={() => addSound(k)}>
                  {SOUND_NAMES[k]} 넣기
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {scene.anims.length === 0 ? (
        <p className="note">
          학생이나 공을 고른 뒤 속성 탭의 <b>이동</b>을 누르고 바닥에서 도착할 곳을 누르세요. 왼쪽 <b>이동 경로</b>{' '}
          도구로 물건을 눌러 도착점까지 끌어도 됩니다.
        </p>
      ) : (
        <>
          <p className="anim-total">
            전체 {timeline.duration.toFixed(1)}초 · 클릭 {timeline.groups.filter((g) => g.waitsForClick).length}번 ·
            막대를 끌면 시작 시각, 오른쪽 끝을 끌면 길이가 바뀝니다
          </p>
          <div className="anim-tracks">
            <ol className="anim-list" ref={listRef}>
              {scene.anims.map((an, i) => {
                const it = byId.get(an.id);
                const prevIt = i > 0 ? byId.get(scene.anims[i - 1].id) : undefined;
                const opens = it && (!prevIt || prevIt.group !== it.group);
                const { name, color } = animTitle(activity, sceneIdx, an);
                const on = sel.includes(an.id);
                return (
                  <li key={an.id} data-anim-row>
                    {dropAt === i && <div className="drop-line" />}
                    {opens && it && (
                      <div className="anim-group">
                        {timeline.groups[it.group]?.waitsForClick
                          ? `클릭 ${clickNumber(timeline.groups, it.group)}`
                          : '장면 시작하면 바로'}
                      </div>
                    )}
                    <div
                      className={`anim-row${on ? ' on' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      onClick={(e) => pickRow(an.id, e)}
                      onKeyDown={(e) => e.key === 'Enter' && setSel([an.id])}
                    >
                      <span className="grip" title="끌어서 순서 바꾸기" onPointerDown={(e) => onGripDown(e, an)}>
                        ⋮⋮
                      </span>
                      <span className="anim-num">{i + 1}</span>
                      <span className={`dot k-${an.kind}`} style={color ? { background: color } : undefined} aria-hidden />
                      <span className="anim-name">
                        {name}
                        {an.speed && an.speed !== 1 ? ` ×${an.speed}` : ''}
                      </span>
                      {it && (
                        <span className="anim-bar-track" aria-hidden>
                          <span
                            className={`anim-bar k-${an.kind}`}
                            style={{
                              left: `${(it.start / total) * 100}%`,
                              width: `${Math.max(2, (it.duration / total) * 100)}%`,
                            }}
                            onPointerDown={(e) => onBarDown(e, an, it)}
                          >
                            <span className="anim-bar-end" />
                          </span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {dropAt === scene.anims.length && <div className="drop-line" />}
            </ol>
            {head !== null && <div className="playhead" style={{ left: pct(head) }} aria-hidden />}
          </div>
          <div className="anim-ruler-bar" onPointerDown={onRulerDown} title="누르거나 끌면 그 순간의 모습을 봅니다">
            {head !== null && <span className="ruler-head" style={{ left: pct(head) }} />}
            <span className="ruler-label" style={{ left: pct(0) }}>
              0초
            </span>
            <span className="ruler-label" style={{ left: pct(total / 2) }}>
              {(total / 2).toFixed(1)}
            </span>
            <span className="ruler-label end" style={{ left: pct(total) }}>
              {total.toFixed(1)}초
            </span>
          </div>
          {scrubT !== null && !playing && (
            <div className="scrub-info">
              <span>{scrubT.toFixed(1)}초 순간을 보는 중</span>
              <button onClick={() => setScrubT(null)}>장면 시작 모습으로</button>
            </div>
          )}
        </>
      )}

      {chosen.length === 1 && (
        <AnimDetail
          activity={activity}
          sceneIdx={sceneIdx}
          anim={chosen[0]}
          item={byId.get(chosen[0].id)}
          isFirst={scene.anims[0]?.id === chosen[0].id}
          isLast={scene.anims[scene.anims.length - 1]?.id === chosen[0].id}
          onChange={(next) => commit(next)}
          onRemove={() => {
            commit(removeItems(activity, sceneIdx, [chosen[0].id]));
            setSel([]);
          }}
          onPlayFrom={(t) => {
            unlockAudio();
            play(sceneIdx, false, t);
          }}
        />
      )}
      {chosen.length > 1 && (
        <MultiDetail
          anims={chosen}
          onChange={(patch) =>
            commit(
              updateAnims(
                activity,
                sceneIdx,
                chosen.map((v) => v.id),
                patch,
              ),
            )
          }
          onRemove={() => {
            commit(
              removeItems(
                activity,
                sceneIdx,
                chosen.map((v) => v.id),
              ),
            );
            setSel([]);
          }}
        />
      )}
    </div>
  );
}

function AnimDetail(props: {
  activity: Activity;
  sceneIdx: number;
  anim: Anim;
  item?: TimedAnim;
  isFirst: boolean;
  isLast: boolean;
  onChange: (a: Activity) => void;
  onRemove: () => void;
  onPlayFrom: (t: number) => void;
}) {
  const { activity, sceneIdx, anim, item, isFirst, isLast, onChange, onRemove, onPlayFrom } = props;
  const obj = anim.objId ? activity.objects.find((o) => o.id === anim.objId) : undefined;
  const starts: AnimStart[] = anim.kind === 'fall' ? ['click', 'with', 'after', 'hit'] : ['click', 'with', 'after'];
  const styles: MoveStyle[] = obj?.kind === 'ball' ? ['roll', 'throw', 'bounce'] : ['walk', 'run'];
  const set = (patch: Partial<Anim>) => onChange(updateAnim(activity, sceneIdx, anim.id, patch));
  const style = obj ? anim.style ?? defaultStyle(obj) : undefined;
  const flying = obj?.kind === 'ball' && (style === 'throw' || style === 'bounce');
  const balls = activity.objects.filter((o) => o.kind === 'ball' && activity.scenes[sceneIdx].poses[o.id]);

  // 공 가지고 가기 목록에서 출발점에 가장 가까운 공을 표시한다
  let nearest: string | undefined;
  if (item?.from) {
    let bestD = Infinity;
    for (const b of balls) {
      const p = activity.scenes[sceneIdx].poses[b.id];
      const d = Math.hypot(p.x - item.from.x, p.z - item.from.z);
      if (d < bestD) {
        bestD = d;
        nearest = b.id;
      }
    }
  }

  return (
    <section className="anim-detail" aria-label="고른 애니메이션">
      <h3>{animTitle(activity, sceneIdx, anim).name}</h3>
      <label className="field">
        <span>시작</span>
        <select id="anim-start" value={anim.start} onChange={(e) => set({ start: e.target.value as AnimStart })}>
          {starts.map((s) => (
            <option key={s} value={s}>
              {START_NAMES[s]}
            </option>
          ))}
        </select>
      </label>
      {isFirst && anim.start !== 'click' && <p className="note">첫 애니메이션이라 장면이 시작되면 바로 움직입니다.</p>}
      <label className="field">
        <span>지연(초)</span>
        <input
          id="anim-delay"
          type="number"
          min={0}
          step={0.1}
          value={anim.delay}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            set({ delay: Number.isFinite(v) && v > 0 ? round1(v) : 0 });
          }}
        />
      </label>
      {anim.kind === 'move' && obj && (
        <>
          <span className="field-label">방식</span>
          <div className="seg">
            {styles.map((st) => (
              <button key={st} className={style === st ? 'on' : ''} onClick={() => set({ style: st })}>
                {STYLE_NAMES[st]}
              </button>
            ))}
          </div>
          <span className="field-label">꺾는 점</span>
          <div className="seg">
            <button
              onClick={() => item?.from && onChange(addVia(activity, sceneIdx, anim.id, item.from))}
              title={
                (flying
                  ? style === 'throw'
                    ? '꺾는 점에서 받아 곧바로 다시 던집니다(패스 잇기). '
                    : '꺾는 점에서 바닥에 튀어 방향을 바꿉니다. '
                  : '') + '가장 긴 구간 가운데에 꺾는 점을 넣습니다. 화면의 흰 점을 끌어 옮기세요'
              }
            >
              ＋ 꺾는 점
            </button>
            {anim.via?.length ? (
              <button onClick={() => onChange(removeVia(activity, sceneIdx, anim.id))}>
                모두 지우기({anim.via.length})
              </button>
            ) : null}
          </div>
          {flying && item?.heights && (
            <HeightPick
              label="떠나는 높이"
              value={anim.fromH}
              auto={item.heights.autoFrom}
              autoNote={item.from && item.from.y > 0.01 ? '받은 높이' : '손 높이'}
              onPick={(h) => set({ fromH: h })}
            />
          )}
          {style === 'throw' && item?.heights && (
            <HeightPick
              label="도착 높이"
              value={anim.toH}
              auto={item.heights.landing?.h ?? BALL_R}
              autoNote={item.heights.landing ? LANDING_NAMES[item.heights.landing.kind] : '바닥에 떨어짐'}
              onPick={(h) => set({ toH: h })}
            />
          )}
          {obj.kind === 'kid' && balls.length > 0 && (
            <>
              <label className="field">
                <span>공 가지고 가기</span>
                <select
                  id="anim-carry"
                  value={anim.carry?.ballId ?? ''}
                  onChange={(e) =>
                    onChange(
                      setCarry(
                        activity,
                        sceneIdx,
                        anim.id,
                        e.target.value ? { ballId: e.target.value, hold: anim.carry?.hold ?? 'foot' } : null,
                      ),
                    )
                  }
                >
                  <option value="">안 함</option>
                  {balls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {objectName(activity, b)}
                      {b.id === nearest ? ' (가장 가까움)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {anim.carry && (
                <div className="seg">
                  {(['foot', 'hand'] as const).map((h) => (
                    <button
                      key={h}
                      className={anim.carry!.hold === h ? 'on' : ''}
                      onClick={() => onChange(setCarry(activity, sceneIdx, anim.id, { ...anim.carry!, hold: h }))}
                    >
                      {h === 'foot' ? '발로 몰고' : '손에 들고'}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      <span className="field-label">빠르기</span>
      <div className="seg small">
        {SPEEDS.map((v) => (
          <button
            key={v}
            className={(anim.speed ?? 1) === v ? 'on' : ''}
            onClick={() => set({ speed: v === 1 ? undefined : v })}
          >
            {v}배
          </button>
        ))}
      </div>
      {item && (
        <p className="note">
          {item.start.toFixed(1)}초에 시작해서 {item.duration.toFixed(1)}초 동안
        </p>
      )}
      <div className="seg">
        <button disabled={isFirst} onClick={() => onChange(moveAnim(activity, sceneIdx, anim.id, -1))} title="순서를 앞으로">
          ▲ 앞으로
        </button>
        <button disabled={isLast} onClick={() => onChange(moveAnim(activity, sceneIdx, anim.id, 1))} title="순서를 뒤로">
          ▼ 뒤로
        </button>
      </div>
      {item && (
        <button className="wide" onClick={() => onPlayFrom(Math.max(0, item.start - 0.2))}>
          ▶ 여기서부터 재생
        </button>
      )}
      <button className="wide danger" onClick={onRemove}>
        애니메이션 지우기
      </button>
    </section>
  );
}

/** 여러 개를 골랐을 때: 시작 방식·지연·빠르기를 한꺼번에 */
/** 공 높이(m) 보이기: 바닥에 닿아 있으면 0 */
const showH = (h: number) => (h <= BALL_R + 0.01 ? '0' : String(round1(h)));

/** 공이 떠나는·도착하는 높이: 알아서 / 높이 단추 / 직접 입력(m) */
function HeightPick(props: {
  label: string;
  value: number | undefined;
  auto: number;
  autoNote: string;
  onPick: (h: number | undefined) => void;
}) {
  const { label, value, auto, autoNote, onPick } = props;
  return (
    <>
      <span className="field-label">{label}</span>
      <div className="seg wrap height-pick">
        <button className={value === undefined ? 'on' : ''} onClick={() => onPick(undefined)} title={`${autoNote}, ${showH(auto)}m`}>
          알아서 · {autoNote}
        </button>
        {HEIGHTS.map((p) => (
          <button
            key={p.name}
            className={value !== undefined && Math.abs(value - p.h) < 0.01 ? 'on' : ''}
            onClick={() => onPick(p.h)}
            title={`${showH(p.h)}m`}
          >
            {p.name}
          </button>
        ))}
        <label className="height-num" title="바닥에서 공 가운데까지 높이(m)">
          <input
            type="number"
            min={0}
            max={6}
            step={0.1}
            value={showH(value ?? auto)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onPick(Math.min(6, Math.max(BALL_R, round1(v))));
            }}
          />
          m
        </label>
      </div>
    </>
  );
}

function MultiDetail(props: {
  anims: Anim[];
  onChange: (patch: Partial<Pick<Anim, 'start' | 'delay' | 'speed'>>) => void;
  onRemove: () => void;
}) {
  const { anims, onChange, onRemove } = props;
  const first = anims[0];
  const start = anims.every((a) => a.start === first.start) ? first.start : undefined;
  const delay = anims.every((a) => a.delay === first.delay) ? first.delay : undefined;
  const speed = anims.every((a) => (a.speed ?? 1) === (first.speed ?? 1)) ? first.speed ?? 1 : undefined;
  return (
    <section className="anim-detail" aria-label="고른 애니메이션 여러 개">
      <h3>{anims.length}개 한꺼번에 바꾸기</h3>
      <label className="field">
        <span>시작</span>
        <select
          id="multi-start"
          value={start ?? ''}
          onChange={(e) => e.target.value && onChange({ start: e.target.value as AnimStart })}
        >
          {start === undefined && <option value="">(서로 다름)</option>}
          {(['click', 'with', 'after'] as AnimStart[]).map((s) => (
            <option key={s} value={s}>
              {START_NAMES[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>지연(초)</span>
        <input
          id="multi-delay"
          type="number"
          min={0}
          step={0.1}
          placeholder="서로 다름"
          value={delay ?? ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange({ delay: Number.isFinite(v) && v > 0 ? round1(v) : 0 });
          }}
        />
      </label>
      <span className="field-label">빠르기</span>
      <div className="seg small">
        {SPEEDS.map((v) => (
          <button key={v} className={speed === v ? 'on' : ''} onClick={() => onChange({ speed: v === 1 ? undefined : v })}>
            {v}배
          </button>
        ))}
      </div>
      <p className="note">손잡이(⋮⋮)를 끌면 고른 것들이 함께 옮겨집니다.</p>
      <button className="wide danger" onClick={onRemove}>
        {anims.length}개 지우기
      </button>
    </section>
  );
}
