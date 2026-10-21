import type { Activity, BoardObject, Pose, Scene } from '../model/activity';
import { addSceneAfter, setPoses } from '../model/ops';

// 견본: 콘 축구(PPT 31~38쪽을 참고해 새로 구성).
// 경계선 뒤의 상대 팀 콘을 공으로 넘어뜨리면 점수.

const objects: BoardObject[] = [];
const poses: Record<string, Pose> = {};

function put(obj: BoardObject, x: number, z: number, rot = 0) {
  objects.push(obj);
  poses[obj.id] = { x, z, rot };
}

const coneZ = [-4, -2, 0, 2, 4];
coneZ.forEach((z, i) => {
  put({ id: `ycone${i}`, kind: 'cone', color: '#f5b400' }, -9.3, z);
  put({ id: `rcone${i}`, kind: 'cone', color: '#e5484d' }, 9.3, z);
});

const yellowSpots: [number, number][] = [
  [-6, -3],
  [-6, 3],
  [-3.5, -1.5],
  [-3.5, 2],
  [-1.2, -3.5],
  [-1.2, 0.6],
];
yellowSpots.forEach(([x, z], i) => put({ id: `y${i}`, kind: 'kid', teamId: 'yellow' }, x, z, Math.PI / 2));
yellowSpots.forEach(([x, z], i) => put({ id: `r${i}`, kind: 'kid', teamId: 'red' }, -x, -z, -Math.PI / 2));
put({ id: 'ball', kind: 'ball' }, -3.1, 2.3);

const first: Scene = {
  id: 'cs1',
  caption: '두 팀이 자기 진영에 선다. 경계선 뒤의 콘을 지킨다.',
  poses,
  bubbles: [],
  arrows: [],
  highlights: [],
};

const layout: Activity = {
  id: 'sample-cone-soccer',
  title: '콘 축구',
  info: {
    players: '두 팀, 팀당 6~10명',
    place: '체육관',
    minutes: 20,
    equipment: ['축구공 1개', '콘 10개', '경계선 테이프'],
    rules: [
      '공이 시작되면 다른 성별 친구에게 한 번 연결된 뒤에 콘을 넘어뜨려야 점수가 된다.',
      '점수를 낸 사람은 바로 다음 점수를 낼 수 없다. 한 번 넘긴 뒤에 다시 낼 수 있다.',
      '콘을 못 넘어뜨리거나 공이 밖으로 나가면 상대 공이 된다.',
      '일부러 손으로 공을 막으면 상대 공격으로 넘어간다.',
    ],
    scoring: '콘 1개 = 1점. 넘어진 콘은 다시 세우지 않는다.',
    safety: ['공을 높이 차지 않는다.', '경계선 안으로 들어가지 않는다.'],
  },
  field: {
    kind: 'gym',
    width: 24,
    depth: 14,
    zones: [{ id: 'court', x: 0, z: 0, w: 20, d: 11, color: '#3f6fc4' }],
    lines: [
      { id: 'lineL', x1: -8.5, z1: -5.5, x2: -8.5, z2: 5.5, color: '#7ccf4a', label: '경계선' },
      { id: 'lineR', x1: 8.5, z1: -5.5, x2: 8.5, z2: 5.5, color: '#7ccf4a', label: '경계선' },
    ],
  },
  teams: [
    { id: 'yellow', name: '노랑 팀', color: '#f5b400' },
    { id: 'red', name: '빨강 팀', color: '#e5484d' },
  ],
  objects,
  scenes: [first],
};

// 장면 2~4: 패스 → 몰고 가기 → 슛으로 콘 넘어뜨리기
function withPlay(a: Activity): Activity {
  let next = addSceneAfter(a, 0).activity;
  next = setPoses(next, 1, {
    ball: { x: -0.95, z: -3.3, move: 'throw' },
    y4: { rot: Math.PI * 0.75 },
    r4: { x: 1.8, z: -2.2 },
  });
  next.scenes[1].caption = '공을 다른 성별 친구에게 연결한다.';
  next.scenes[1].highlights = ['y4'];

  next = addSceneAfter(next, 1).activity;
  next = setPoses(next, 2, {
    y4: { x: 5.2, z: -2.6, rot: Math.PI / 2 },
    ball: { x: 5.6, z: -2.5, move: 'roll' },
    r4: { x: 4.2, z: -1.4 },
    r0: { x: 6.5, z: 1.6 },
  });
  next.scenes[2].caption = '공을 몰고 상대 콘 쪽으로 간다.';

  next = addSceneAfter(next, 2).activity;
  next = setPoses(next, 3, {
    ball: { x: 10.2, z: -2.15, move: 'roll' },
    rcone1: { fallen: true },
  });
  next.scenes[3].caption = '경계선 밖에서 차서 콘을 넘어뜨리면 1점!';
  next.scenes[3].highlights = ['rcone1'];
  return next;
}

export const coneSoccer: Activity = withPlay(layout);
