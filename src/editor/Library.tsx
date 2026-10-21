import { useRef, useState } from 'react';
import type { FieldKind } from '../model/activity';
import { emptyActivity } from '../model/activity';
import { coneSoccer } from '../samples/coneSoccer';
import {
  copyOf,
  deleteActivity,
  downloadFile,
  fromFile,
  listActivities,
  loadActivity,
  saveActivity,
  type ActivityMeta,
} from '../storage/library';
import { useEditor } from './store';

// 내 설명판: 새로 만들기, 열기, 복제, 지우기, 파일 가져오기·내보내기.

const PLACES: { id: FieldKind; name: string }[] = [
  { id: 'gym', name: '체육관' },
  { id: 'playground', name: '운동장' },
  { id: 'classroom', name: '교실' },
];
const PLACE_NAME = Object.fromEntries(PLACES.map((p) => [p.id, p.name])) as Record<FieldKind, string>;

interface Props {
  onClose: () => void;
  /** 다른 설명판을 열기 전에 지금 것을 바로 저장 */
  flush: () => void;
}

export function Library({ onClose, flush }: Props) {
  const current = useEditor((s) => s.activity.id);
  const load = useEditor((s) => s.load);
  const [list, setList] = useState<ActivityMeta[]>(() => listActivities());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setList(listActivities());
  const open = (a: ReturnType<typeof emptyActivity>) => {
    flush();
    try {
      saveActivity(a);
    } catch {
      setError('브라우저 저장 공간이 꽉 찼습니다. 안 쓰는 설명판을 지우거나 파일로 내보내 주세요.');
      return;
    }
    load(a);
    onClose();
  };

  return (
    <div className="dialog-back" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="lib-title">
        <header className="dialog-head">
          <h2 id="lib-title">내 설명판</h2>
          <button className="icon" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className="lib-new">
          <span>새로 만들기</span>
          {PLACES.map((p) => (
            <button key={p.id} onClick={() => open(emptyActivity('새 활동', p.id))}>
              {p.name}
            </button>
          ))}
          <button onClick={() => open(copyOf(coneSoccer, '콘 축구 (견본)'))}>견본: 콘 축구</button>
          <button onClick={() => fileRef.current?.click()}>파일 가져오기</button>
          <input
            ref={fileRef}
            id="lib-import"
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                open(fromFile(await f.text()));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </div>
        {error && (
          <p className="lib-error" role="alert">
            {error}
          </p>
        )}

        {list.length === 0 ? (
          <p className="note">아직 저장한 설명판이 없습니다.</p>
        ) : (
          <ul className="lib-list">
            {list.map((m) => (
              <li key={m.id} className={m.id === current ? 'current' : ''}>
                <div className="lib-info">
                  <strong>{m.title || '이름 없는 활동'}</strong>
                  <span>
                    {PLACE_NAME[m.place]} · 장면 {m.scenes}개 · {formatTime(m.updatedAt)}
                    {m.id === current && ' · 지금 여는 중'}
                  </span>
                </div>
                {confirmId === m.id ? (
                  <div className="lib-actions">
                    <span className="lib-ask">지울까요? 되돌릴 수 없습니다.</span>
                    <button
                      className="danger"
                      onClick={() => {
                        deleteActivity(m.id);
                        setConfirmId(null);
                        if (m.id === current) {
                          const rest = listActivities();
                          const next = rest[0] && loadActivity(rest[0].id);
                          load(next || emptyActivity());
                        }
                        refresh();
                      }}
                    >
                      지우기
                    </button>
                    <button onClick={() => setConfirmId(null)}>취소</button>
                  </div>
                ) : (
                  <div className="lib-actions">
                    {m.id !== current && (
                      <button
                        onClick={() => {
                          const a = loadActivity(m.id);
                          if (!a) return setError('이 설명판을 읽지 못했습니다. 저장된 내용이 손상되었습니다.');
                          flush();
                          load(a);
                          onClose();
                        }}
                      >
                        열기
                      </button>
                    )}
                    <button
                      onClick={() => {
                        flush();
                        const a = loadActivity(m.id);
                        if (!a) return;
                        saveActivity(copyOf(a));
                        refresh();
                      }}
                    >
                      복제
                    </button>
                    <button
                      onClick={() => {
                        flush();
                        const a = loadActivity(m.id);
                        if (a) downloadFile(a);
                      }}
                    >
                      파일로 내보내기
                    </button>
                    <button className="danger" onClick={() => setConfirmId(m.id)}>
                      지우기
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="note">
          설명판은 이 컴퓨터의 브라우저에 자동으로 저장됩니다. 다른 컴퓨터로 옮기거나 백업하려면 "파일로 내보내기"를
          쓰세요.
        </p>
      </section>
    </div>
  );
}

export function formatTime(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `오늘 ${hm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}
