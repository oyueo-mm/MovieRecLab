# MovieRec Lab

MovieLens의 실제 사용자 평점 데이터로 추천 시스템을 체험하는 **COW 1회차 교육용 웹 데모**입니다.

## 실행하기

- GitHub Pages에서 `https://oyueo-mm.github.io/MovieRecLab/`에 접속하면 **자동으로 데이터가 로딩**됩니다.
- 영화 검색 → 0.5~5점 평점 입력 → 인기 기반 / 장르 기반 / 사용자 협업 필터링 추천 및 비교
- 데이터 분석 탭에서 평점 분포·장르별 영화 수·인기 영화·품질 검사 확인
- 자동 로딩이 차단되면 **다시 시도** 또는 **공식 ZIP 직접 선택**을 이용할 수 있습니다.

## 데이터 출처 및 조건

- 원본: [GroupLens Research — MovieLens latest-small](https://grouplens.org/datasets/movielens/latest/) (2018년 9월 26일 생성 표본)
- 영화·평점 CSV는 [공개 미러](https://github.com/smanihwr/ml-latest-small/tree/ba3cd91761e54faa64483456b619d1a1f4d70971)의 고정 커밋에서 브라우저가 직접 가져옵니다. 미러에 장애가 발생하면 jsDelivr CDN으로 재시도합니다.
- 데이터는 610명의 사용자, 9,742개 영화, 100,836건의 평점을 포함합니다.
- 개인 실습·비상업적 교육 목적입니다. GroupLens가 이 프로젝트를 보증하거나 후원하지 않습니다.
- MovieLens 데이터의 [사용 조건](https://files.grouplens.org/datasets/movielens/ml-latest-small-README.html)을 확인하세요. 상업적 사용에는 별도 허가가 필요합니다.
- 웹 데모는 MovieLens ZIP/CSV 원본을 저장소에 포함하지 않습니다. 브라우저에서만 처리합니다.

## 배포

저장소의 `main` 브랜치 루트에 `index.html`이 있습니다. GitHub → **Settings → Pages → Deploy from a branch → main / (root)**로 활성화하세요.

## 한계

이것은 1회차 학습용 프로토타입입니다. 추천 결과는 실제 데이터 기반이지만, 추천 알고리즘의 정량적 일반화 성능은 아직 측정하지 않았습니다. 원격 데이터 제공 서비스가 CORS·네트워크 정책을 바꾸면 ZIP 수동 로딩이 필요할 수 있습니다.
