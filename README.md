# 체육 설명판 (pe-board)

체육 활동을 3D 장면으로 만들고, 수업 시간에 장면을 넘기며 아이들에게 설명하는 웹앱.

## 실행

```
npm install
npm run dev      # http://localhost:5180
npm test
npm run build    # dist/ — file:// 로 열어도 동작(base './')
```

## 구조

| 위치 | 역할 |
|---|---|
| `src/model/` | 활동 데이터 구조(`activity.ts`), 장비 목록(`catalog.ts`) |
| `src/scene/` | 3D 무대·카메라(`Stage.tsx`), 경기장(`Field.tsx`), 저폴리 모델(`models/`) |
| `src/samples/` | 견본 활동 |

길이 단위는 m, 바닥은 x·z 평면, 가운데가 원점.
