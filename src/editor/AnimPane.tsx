import { useMemo } from 'react';
import type { Activity, Anim, AnimStart, BoardObject, MoveStyle } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { moveAnim, removeItems, updateAnim } from '../model/ops';
import { buildTimeline, defaultStyle, SPEEDS, type TimedAnim, type Timeline } from '../motion/timeline';
import { useEditor } from './store';

// 애니메이션 창(PPT의 애니메이션 창처럼): 순서, 시작 방식, 지연, 시간 막대.

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
};

const STYLE_NAMES: Record<MoveStyle, string> = {
  walk: '걷기',
  run: '뛰기',
  roll: '굴러감',
  throw: '던짐',
  bounce: '튀김',
};

/** 목록에 보일 물건 이름: 이름표가 있으면 그것, 없으면 "빨강 팀 학생 3", "콘 2" */
export function objectName(a: Activity, obj: BoardObject): string {
  if (obj.label) return obj.label;
  const same = a.objects.filter((o) => o.kind === obj.kind && o.teamId === obj.teamId);
  const n = same.findIndex((o) => o.id === obj.id) + 1;
  const kind = CATALOG_BY_KIND[obj.kind].name;
  const team = obj.teamId ? a.teams.find((t) => t.id === obj.teamId)?.name : undefined;
  return `${team ? `${team} ` : ''}${kind}${same.length > 1 ? ` ${n}` : ''}`;
}

export function AnimPane() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const sel = useEditor((s) => s.sel);
  const playing = useEditor((s) => s.playing);
  const commit = useEditor((s) => s.commit);
  const setSel = useEditor((s) => s.setSel);
  const play = useEditor((s) => s.play);
  const stop = useEditor((s) => s.stop);
  const playRate = useEditor((s) => s.playRate);
  const setPlayRate = useEditor((s) => s.setPlayRate);
  const scene = activity.scenes[sceneIdx];
  const timeline = useMemo(() => buildTimeline(activity, sceneIdx), [activity, sceneIdx]);
  const byId = new Map(timeline.items.map((it) => [it.anim.id, it]));
  const total = Math.max(timeline.duration, 1);
  const chosen = scene.anims.find((an) => sel.includes(an.id));

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
            <button className="play" disabled={!scene.anims.length} onClick={() => play(sceneIdx, false)} title="Space">
              ▶ 재생
            </button>
          )}
        </div>
      </div>
      {scene.anims.length === 0 ? (
        <p className="note">
          학생이나 공을 고른 뒤 속성 탭의 <b>이동</b>을 누르고 바닥에서 도착할 곳을 누르세요. 왼쪽 <b>이동 경로</b>{' '}
          도구로 물건을 눌러 도착점까지 끌어도 됩니다.
        </p>
      ) : (
        <>
          <p className="anim-total">
            전체 {timeline.duration.toFixed(1)}초 · 클릭 {timeline.groups.filter((g) => g.waitsForClick).length}번
          </p>
          <ol className="anim-list">
            {scene.anims.map((an, i) => {
              const it = byId.get(an.id);
              const obj = activity.objects.find((o) => o.id === an.objId);
              if (!obj) return null;
              const opens = it && (i === 0 || timeline.items.find((x) => x.anim.id === scene.anims[i - 1]?.id)?.group !== it.group);
              return (
                <li key={an.id}>
                  {opens && it && (
                    <div className="anim-group">
                      {timeline.groups[it.group]?.waitsForClick ? `클릭 ${clickNumber(timeline.groups, it.group)}` : '장면 시작하면 바로'}
                    </div>
                  )}
                  <button
                    className={`anim-row${sel.includes(an.id) ? ' on' : ''}`}
                    onClick={() => setSel([an.id])}
                    aria-pressed={sel.includes(an.id)}
                  >
                    <span className="anim-num">{i + 1}</span>
                    <span className="dot" style={{ background: colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor }} />
                    <span className="anim-name">
                      {objectName(activity, obj)} · {KIND_NAMES[an.kind]}
                      {an.kind === 'move' && ` (${STYLE_NAMES[an.style ?? defaultStyle(obj)]})`}
                      {an.speed && an.speed !== 1 ? ` ×${an.speed}` : ''}
                    </span>
                    {it && (
                      <span className="anim-bar-track" aria-hidden>
                        <span
                          className={`anim-bar k-${an.kind}`}
                          style={{
                            left: `${(it.start / total) * 100}%`,
                            width: `${Math.max(1.5, (it.duration / total) * 100)}%`,
                          }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="anim-ruler" aria-hidden>
            <span>0초</span>
            <span>{(total / 2).toFixed(1)}초</span>
            <span>{total.toFixed(1)}초</span>
          </div>
        </>
      )}

      {chosen && (
        <AnimDetail
          activity={activity}
          sceneIdx={sceneIdx}
          anim={chosen}
          item={byId.get(chosen.id)}
          isFirst={scene.anims[0]?.id === chosen.id}
          isLast={scene.anims[scene.anims.length - 1]?.id === chosen.id}
          onChange={(next) => commit(next)}
          onRemove={() => {
            commit(removeItems(activity, sceneIdx, [chosen.id]));
            setSel([]);
          }}
        />
      )}
    </div>
  );
}

/** 몇 번째 클릭인지(자동으로 시작하는 묶음은 세지 않는다) */
function clickNumber(groups: Timeline['groups'], group: number) {
  return groups.slice(0, group + 1).filter((g) => g.waitsForClick).length;
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
}) {
  const { activity, sceneIdx, anim, item, isFirst, isLast, onChange, onRemove } = props;
  const obj = activity.objects.find((o) => o.id === anim.objId)!;
  const starts: AnimStart[] = anim.kind === 'fall' ? ['click', 'with', 'after', 'hit'] : ['click', 'with', 'after'];
  const styles: MoveStyle[] = obj.kind === 'ball' ? ['roll', 'throw', 'bounce'] : ['walk', 'run'];
  const set = (patch: Partial<Anim>) => onChange(updateAnim(activity, sceneIdx, anim.id, patch));

  return (
    <section className="anim-detail" aria-label="고른 애니메이션">
      <h3>
        {objectName(activity, obj)} · {KIND_NAMES[anim.kind]}
      </h3>
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
            set({ delay: Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0 });
          }}
        />
      </label>
      {anim.kind === 'move' && (
        <>
          <span className="field-label">방식</span>
          <div className="seg">
            {styles.map((st) => (
              <button
                key={st}
                className={(anim.style ?? defaultStyle(obj)) === st ? 'on' : ''}
                onClick={() => set({ style: st })}
              >
                {STYLE_NAMES[st]}
              </button>
            ))}
          </div>
          <p className="note">도착점은 화면에서 번호가 붙은 원을 끌어 옮깁니다.</p>
        </>
      )}
      <span className="field-label">빠르기</span>
      <div className="seg small">
        {SPEEDS.map((v) => (
          <button key={v} className={(anim.speed ?? 1) === v ? 'on' : ''} onClick={() => set({ speed: v === 1 ? undefined : v })}>
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
      <button className="wide danger" onClick={onRemove}>
        애니메이션 지우기
      </button>
    </section>
  );
}
