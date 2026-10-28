# 체육 설명판 (pe-board)

체육 활동을 3D 장면으로 만들고, 수업 시간에 장면을 넘기며 아이들에게 설명하는 웹앱.

## 실행

```
npm install
npm run dev      # http://localhost:5180
npm test
npm run build    # dist/ — file:// 로 열어도 동작(base './')
```

## 다른 컴퓨터에서 이어서 작업하기

처음 한 번(Windows 명령 프롬프트):

```
cd /d C:\dev
git clone https://github.com/SDH19881111/sportspan.git
cd sportspan
npm install
npm run dev
```

그다음부터는 작업 전에 `git pull`, 끝나면 `git add -A` → `git commit -m "내용"` → `git push`.

- OneDrive 폴더(바탕화면 등) 안에서 `npm install` 하지 말 것. `C:\dev` 같은 곳에 둔다.
- 만든 설명판은 그 컴퓨터의 브라우저에 저장된다. 다른 컴퓨터로 옮기려면 **내 설명판 → 파일로 내보내기**로 받은 `.json`을 저쪽에서 **파일 가져오기** 한다.

## 구조

| 위치 | 역할 |
|---|---|
| `src/model/` | 활동 데이터 구조(`activity.ts`), 장비 목록·보기 배율(`catalog.ts`), 바꾸는 순수 함수(`ops.ts`), 경기장 선 틀(`courts.ts`) |
| `src/motion/` | 움직임 공식(`physics.ts`: 달리기 가감속·굴리기·던지기·튕기기·콘 넘어짐), 장면 안 애니메이션 시간표(`timeline.ts`), 발표 중 학생 자유 움직임(`wander.ts`) |
| `src/editor/` | 편집기 상태(`store.ts`)·화면 조작·패널·장면 띠·내 설명판 |
| `src/scene/` | 3D 무대·카메라(`Stage.tsx`), 경기장(`Field.tsx`), 표시(`Marks.tsx`), 저폴리 모델(`models/`) |
| `src/present/` | 발표 화면·미리보기(`Presenter.tsx`), 단계 넘기기 규칙(`steps.ts`: 클릭 묶음·장면 끝마다 멈춤) |
| `src/storage/` | 브라우저 저장·파일 내보내기/가져오기(`library.ts`) |
| `src/samples/` | 견본 활동 |

장면은 시작할 때 모든 물건의 자리(`poses`)와 PPT처럼 순서가 있는 애니메이션 목록(`anims`)을 갖는다. 시작 방식은 클릭할 때 / 앞과 함께 / 앞 다음에 / 공이 닿을 때. `buildTimeline`이 한 번 계산해 두고 재생할 때 꺼내 쓴다(같은 장면은 언제나 같게 움직인다). 예전(버전 1) 저장본은 `model/migrate.ts`가 바꾼다.

길이 단위는 m, 바닥은 x·z 평면, 가운데가 원점.
