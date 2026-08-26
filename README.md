# 시간표 커스텀 메이커 🗓️

에타(에브리타임) 시간표 캡쳐본을 올리면, 손그림(꼬불꼬불) 스타일 시간표 배경화면을 만들어 주는 웹앱.
빌드 도구 없이 **정적 파일만으로 동작**하므로 GitHub Pages에 그대로 올리면 됩니다.

## 기능
1. **기기별 배경화면 크기** — 아이폰/갤럭시/아이패드 프리셋에 맞춘 해상도로 저장
2. **시간표 자동 파싱** — 캡쳐본의 색 블록·격자선을 분석해 요일/시간/칸 수를 자동 인식
   → 진한 회색 손그림 선 + 랜덤 파스텔 과목 색으로 재생성
   → `과목명 자동 인식`을 누르면 Tesseract.js(OCR)로 과목명·강의실까지 채움 (최초 1회 다운로드 필요)
   → `확인/수정`에서 시작·종료 시각, 요일 수, 과목명을 직접 고칠 수 있음 (에타 시간표에 따라 유동적)
3. **배경화면 9종 + 직접 추가** — 직접 추가하면 버튼 아래에 썸네일이 뜨고 선택 가능
4. **말풍선 선택은 선택 사항** — 고르지 않으면 말풍선 없이 생성 (다시 누르면 해제)
5. **말풍선 문구는 정중앙 정렬** — 길이에 맞춰 자동으로 글자 크기 조절
6. **탭해서 색 바꾸기** — 과목을 탭하면 그 박스 색, 빈 칸을 탭하면 시간표 선 색이 바뀜
7. **글꼴 선택** — 말풍선·과목 모두 적용 (기본: Pretendard)
8. **말풍선 / 캐릭터 크기·위치 조절** — 드래그로 이동, 오른쪽 아래 파란 점으로 크기 조절
9. **완료 버튼** — 누르면 시간표 자체를 화면에 맞게 옮기고 크기 조절 가능
10. **사진 저장** — JPG로 다운로드
- **캐릭터 누끼** — 캐릭터 사진을 올리면 배경을 자동 제거해 스티커처럼 붙여 줌

## 폴더
```
index.html      화면 3개(메인 / 커스텀 / 완성본)
css/style.css   피그마 스펙 기준 스타일
js/app.js       파싱·누끼·캔버스 렌더링·저장
assets/bg       기본 배경화면 9종
assets/bubble   말풍선 6종
design/         원본 디자인 시안 (배포에는 불필요)
fonts/          손글씨 폰트 파일을 넣는 곳
```

## 폰트 넣기
저작권 때문에 폰트 파일은 포함하지 않았습니다. 아래에서 받아 `fonts/` 에 **정확한 이름**으로 넣어 주세요.
(구글폰트 손글씨체 5종은 파일 없이도 바로 동작합니다.)

| 글꼴 | 파일명 | 받는 곳 |
|---|---|---|
| 배달의민족 꾸불림체 | `fonts/BMKkubulim.ttf` | https://font.co.kr/collection/sub?family_idx=11053 |
| Yoon 지희 | `fonts/YoonJihee.ttf` | https://font.co.kr/collection/sub?family_idx=10092 |
| Yoon 세희 | `fonts/YoonSehee.ttf` | https://font.co.kr/collection/sub?family_idx=10088 |
| Ok 단단체 | `fonts/OkDandan.ttf` | https://freefontpick.co.kr/font/238 |

`.otf` 파일이면 확장자만 `.otf`로 두면 됩니다(둘 다 인식). 상업적 이용 전에는 각 폰트의 라이선스를 확인하세요.

## 배포 (GitHub Pages)
```bash
git init && git add -A && git commit -m "시간표 커스텀 메이커"
git branch -M main
git remote add origin https://github.com/<아이디>/timetable-maker.git
git push -u origin main
```
GitHub 저장소 → Settings → Pages → Source: `main` / `(root)` 저장.
`https://<아이디>.github.io/timetable-maker/` 로 공유하면 됩니다.

## 로컬 확인
```bash
python3 -m http.server 8765
```
`file://` 로 열면 캔버스 보안 정책 때문에 저장이 막히니 꼭 서버로 여세요.
