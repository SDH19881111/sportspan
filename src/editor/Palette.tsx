import type { ObjectKind } from '../model/activity';
import { CATALOG } from '../model/catalog';
import { useEditor, type Tool } from './store';

// 왼쪽 도구 모음: 고르기, 학생(팀별), 장비, 그리기.

const EQUIPMENT = CATALOG.filter((c) => c.kind !== 'kid');

const DRAW: { t: 'zone' | 'line' | 'arrow' | 'bubble' | 'path'; name: string; hint: string }[] = [
  { t: 'path', name: '이동 경로', hint: '학생이나 공을 눌러 도착할 곳까지 끌면 이동 애니메이션이 생깁니다' },
  { t: 'zone', name: '구역', hint: '바닥을 끌어 색 구역을 그립니다' },
  { t: 'line', name: '선', hint: '바닥을 끌어 경계선을 긋습니다' },
  { t: 'arrow', name: '화살표', hint: '바닥을 끌어 움직일 길을 표시합니다' },
  { t: 'bubble', name: '말풍선', hint: '학생이나 장비를 누르면 말풍선이 붙습니다' },
];

function same(a: Tool, b: Tool) {
  if (a.t !== b.t) return false;
  if (a.t === 'place' && b.t === 'place') return a.kind === b.kind && a.teamId === b.teamId;
  return true;
}

export function Palette() {
  const tool = useEditor((s) => s.tool);
  const teams = useEditor((s) => s.activity.teams);
  const setTool = useEditor((s) => s.setTool);
  const grid = useEditor((s) => s.grid);
  const setGrid = useEditor((s) => s.setGrid);

  const btn = (t: Tool, label: React.ReactNode, title: string, key?: string) => (
    <button
      key={key}
      className={`tool${same(tool, t) ? ' on' : ''}`}
      title={title}
      aria-pressed={same(tool, t)}
      onClick={() => setTool(same(tool, t) && t.t !== 'select' ? { t: 'select' } : t)}
    >
      {label}
    </button>
  );

  return (
    <aside className="palette" aria-label="도구">
      <section>
        {btn({ t: 'select' }, <><Glyph kind="select" />고르기</>, '눌러서 고르고, 끌어서 옮깁니다 (Esc)')}
      </section>
      <section>
        <h2>학생</h2>
        {teams.map((team) =>
          btn(
            { t: 'place', kind: 'kid', teamId: team.id },
            <>
              <span className="dot" style={{ background: team.color }} />
              {team.name}
            </>,
            `${team.name} 학생을 바닥에 놓습니다`,
            team.id,
          ),
        )}
      </section>
      <section>
        <h2>장비</h2>
        <div className="grid2">
          {EQUIPMENT.map((c) =>
            btn(
              { t: 'place', kind: c.kind },
              <>
                <Glyph kind={c.kind} color={c.defaultColor} />
                {c.name}
              </>,
              `${c.name}을(를) 바닥에 놓습니다`,
              c.kind,
            ),
          )}
        </div>
      </section>
      <section>
        <h2>그리기</h2>
        <div className="grid2">
          {DRAW.map((d) => btn({ t: d.t }, <><Glyph kind={d.t} />{d.name}</>, d.hint, d.t))}
        </div>
      </section>
      <section>
        <h2>맞추기</h2>
        <div className="grid2">
          <button
            className={`tool${grid.show ? ' on' : ''}`}
            aria-pressed={grid.show}
            onClick={() => setGrid({ show: !grid.show })}
            title="바닥에 격자를 그립니다"
          >
            <Glyph kind="gridIcon" />
            격자
          </button>
          <button
            className={`tool${grid.snap ? ' on' : ''}`}
            aria-pressed={grid.snap}
            onClick={() => setGrid({ snap: !grid.snap })}
            title="놓고 옮기고 그릴 때 격자 칸에 맞춥니다. Alt를 누르고 있으면 잠깐 꺼집니다"
          >
            <Glyph kind="magnet" />
            자석
          </button>
        </div>
        <div className="seg small" role="group" aria-label="격자 칸 크기">
          {[0.25, 0.5, 1].map((v) => (
            <button key={v} className={grid.size === v ? 'on' : ''} onClick={() => setGrid({ size: v })}>
              {v < 1 ? `${v * 100}cm` : '1m'}
            </button>
          ))}
        </div>
      </section>
      <p className="tip">{tipFor(tool)}</p>
    </aside>
  );
}

function tipFor(tool: Tool) {
  switch (tool.t) {
    case 'select':
      return '물건을 눌러 고르고 끌어서 옮깁니다. Shift를 누른 채 누르면 하나씩 더하고, Ctrl을 누른 채 빈 바닥을 끌면 사각형 안의 것을 한꺼번에 고릅니다. 빈 바닥을 끌면 화면이 돌고, 아무것도 안 골랐을 때 방향키로 화면을 옮깁니다.';
    case 'place':
      return '바닥을 누를 때마다 하나씩 놓입니다. 다 놓았으면 Esc.';
    case 'zone':
      return '바닥을 대각선으로 끌어 구역을 그립니다.';
    case 'line':
      return '바닥을 끌어 선을 긋습니다.';
    case 'arrow':
      return '움직일 방향으로 바닥을 끌어 화살표를 그립니다. 화살표는 지금 장면에만 보입니다.';
    case 'bubble':
      return '말풍선을 달 학생이나 장비를 누릅니다.';
    case 'path':
      return tool.ids?.length
        ? '바닥에서 도착할 곳을 누르세요. 고른 것이 그곳까지 움직입니다.'
        : '움직일 학생이나 공을 눌러 도착할 곳까지 끄세요. 이 장면 안에서 움직이는 애니메이션이 됩니다.';
  }
}

// 버튼 앞의 작은 그림(SVG). 이모지 대신 장비 모양을 단순하게 그린다.
function Glyph({ kind, color = 'currentColor' }: { kind: ObjectKind | Tool['t'] | 'gridIcon' | 'magnet'; color?: string }) {
  const p = { width: 18, height: 18, viewBox: '0 0 18 18', 'aria-hidden': true } as const;
  switch (kind) {
    case 'select':
      return (
        <svg {...p}>
          <path d="M4 2l10 7-4.5 1 2.5 5-2 1-2.5-5L4 14z" fill="currentColor" />
        </svg>
      );
    case 'cone':
      return (
        <svg {...p}>
          <path d="M9 2l5 13H4z" fill={color} />
          <rect x="2" y="14" width="14" height="2" fill={color} />
        </svg>
      );
    case 'disc':
      return (
        <svg {...p}>
          <path d="M2 13c2-4 12-4 14 0z" fill={color} />
        </svg>
      );
    case 'ball':
      return (
        <svg {...p}>
          <circle cx="9" cy="9" r="6.5" fill="#fff" stroke="#555" />
          <path d="M9 5.5l3 2-1 3.5H7l-1-3.5z" fill="#333" />
        </svg>
      );
    case 'hoop':
      return (
        <svg {...p}>
          <ellipse cx="9" cy="10" rx="7" ry="4" fill="none" stroke={color} strokeWidth="2" />
        </svg>
      );
    case 'bib':
      return (
        <svg {...p}>
          <path d="M5 2h2.5a1.5 1.5 0 003 0H13v14H5z" fill={color} />
        </svg>
      );
    case 'beanbag':
      return (
        <svg {...p}>
          <rect x="3" y="6" width="12" height="7" rx="3" fill={color} />
        </svg>
      );
    case 'cup':
      return (
        <svg {...p}>
          <path d="M5 4h8l-1 11H6z" fill={color} />
        </svg>
      );
    case 'bell':
      return (
        <svg {...p}>
          <path d="M4 13a5 5 0 0110 0z" fill={color} />
          <rect x="3" y="13" width="12" height="2" fill="#bbb" />
          <circle cx="9" cy="6.5" r="1.3" fill={color} />
        </svg>
      );
    case 'basket':
      return (
        <svg {...p}>
          <path d="M2 6h14l-2 9H4z" fill={color} />
        </svg>
      );
    case 'goal':
      return (
        <svg {...p}>
          <path d="M2 15V4h14v11" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'desk':
      return (
        <svg {...p}>
          <rect x="2" y="6" width="14" height="2.5" fill={color} />
          <path d="M4 8.5v6M14 8.5v6" stroke="#888" strokeWidth="1.5" />
        </svg>
      );
    case 'zone':
      return (
        <svg {...p}>
          <rect x="2.5" y="4" width="13" height="10" fill="#3f6fc4" opacity=".8" />
        </svg>
      );
    case 'line':
      return (
        <svg {...p}>
          <path d="M3 15L15 3" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...p}>
          <path d="M3 14L12 5" stroke="#e0a800" strokeWidth="2.5" />
          <path d="M8 3h7v7z" fill="#e0a800" />
        </svg>
      );
    case 'gridIcon':
      return (
        <svg {...p}>
          <path d="M2 6h14M2 12h14M6 2v14M12 2v14" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case 'magnet':
      return (
        <svg {...p}>
          <path d="M4 3v6a5 5 0 0010 0V3h-3v6a2 2 0 01-4 0V3z" fill="#e5484d" />
          <path d="M4 3h3v2.5H4zM11 3h3v2.5h-3z" fill="#c8ccd4" />
        </svg>
      );
    case 'path':
      return (
        <svg {...p}>
          <circle cx="4" cy="14" r="2.5" fill="currentColor" />
          <path d="M6 12.5C9 11 8 6 13 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
          <path d="M11 2.5l4 2.3-3.3 3z" fill="currentColor" />
        </svg>
      );
    case 'bubble':
      return (
        <svg {...p}>
          <path d="M2 3h14v9H8l-4 3v-3H2z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    default:
      return null;
  }
}
