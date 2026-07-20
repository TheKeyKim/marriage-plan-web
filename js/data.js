/* =========================================================================
 * data.js — 초기 데이터 (공개 템플릿 / 개인정보 없음)
 * -------------------------------------------------------------------------
 * 이 파일은 공개 저장소에 올라가는 "빈 템플릿"입니다.
 * 실제 이름·업체·금액 등 개인정보는 여기에 넣지 말고,
 * 앱에서 편집한 뒤 브라우저 저장(localStorage) 또는 비공개 저장소에 보관하세요.
 *
 *   CATEGORIES  : 분류 목록 (개요 화면·필터의 그룹 기준)
 *   DEFAULT_ROWS: 준비 항목 배열
 *     category : CATEGORIES의 id
 *     done     : 완료 체크 (= 상태 '완료' 와 동기화)
 *     type     : '필수' | '선택'
 *     item     : 항목명
 *     opt      : 선택지 / 업체 (비교 메모)
 *     price    : 예상 총 금액 (만원, 미정이면 null)
 *     deposit  : 이미 낸 계약금 (만원)
 *     status   : 검토중 | 예정 | 계약 | 완료
 *     memo     : 비고
 * ========================================================================= */

const META = {
  groom: "신랑", bride: "신부",
  date: "2026-12-05T13:00", venue: "예식장",
};

const CATEGORIES = [
  { id: "hall",     name: "예식·예식장",  icon: "💒" },
  { id: "sdm",      name: "스드메",       icon: "📸" },
  { id: "record",   name: "본식 기록",    icon: "🎞️" },
  { id: "beauty",   name: "뷰티·부가",    icon: "💐" },
  { id: "gift",     name: "예물·예단",    icon: "💍" },
  { id: "newlywed", name: "신혼 준비",    icon: "🏠" },
  { id: "admin",    name: "행정·비용",    icon: "📋" },
];

// 일반적인 한국 결혼 준비 항목 (예시 값 없음 · 자유롭게 수정)
const DEFAULT_ROWS = [
  /* 예식·예식장 */
  { category: "hall", done: false, type: "필수", item: "예식장",       opt: "업체 비교",     price: null, deposit: 0, status: "검토중", memo: "보증인원·식대·예식 간격 확인" },
  { category: "hall", done: false, type: "필수", item: "청첩장",       opt: "모바일 / 종이", price: null, deposit: 0, status: "검토중", memo: "본식 2~3개월 전 발송" },
  { category: "hall", done: false, type: "선택", item: "사회자·축가",   opt: "지인 / 전문",   price: null, deposit: 0, status: "검토중", memo: "답례비·MR 준비" },
  { category: "hall", done: false, type: "선택", item: "폐백",         opt: "진행 여부",     price: null, deposit: 0, status: "검토중", memo: "생략 가능" },

  /* 스드메 */
  { category: "sdm", done: false, type: "필수", item: "드레스",        opt: "업체 비교",     price: null, deposit: 0, status: "검토중", memo: "가봉·2부 드레스 별도 확인" },
  { category: "sdm", done: false, type: "필수", item: "턱시도",        opt: "포함 여부 확인", price: null, deposit: 0, status: "검토중", memo: "구두·양말 개인준비" },
  { category: "sdm", done: false, type: "필수", item: "웨딩촬영",      opt: "스튜디오 비교",  price: null, deposit: 0, status: "검토중", memo: "컨셉 추가 시 별도 비용" },
  { category: "sdm", done: false, type: "필수", item: "본식 헤어·메이크업", opt: "업체 비교", price: null, deposit: 0, status: "검토중", memo: "당일 시간 확인" },

  /* 본식 기록 */
  { category: "record", done: false, type: "선택", item: "본식스냅",   opt: "작가·캠 수 비교", price: null, deposit: 0, status: "검토중", memo: "추가비용 항목 확인" },
  { category: "record", done: false, type: "선택", item: "DVD 영상",   opt: "필요 시 선택",   price: null, deposit: 0, status: "검토중", memo: "다큐형 / 풀영상" },

  /* 뷰티·부가 */
  { category: "beauty", done: false, type: "선택", item: "혼주 헤메",  opt: "지정샵 / 개별",  price: null, deposit: 0, status: "검토중", memo: "" },
  { category: "beauty", done: false, type: "선택", item: "부케",       opt: "본식 / 촬영",    price: null, deposit: 0, status: "검토중", memo: "" },
  { category: "beauty", done: false, type: "선택", item: "헬퍼비",     opt: "예식당일 현금",  price: null, deposit: 0, status: "검토중", memo: "당일 현금 준비" },

  /* 예물·예단 */
  { category: "gift", done: false, type: "필수", item: "예물",         opt: "커플링 (반지)",  price: null, deposit: 0, status: "검토중", memo: "촬영 1~2달 전 계약" },
  { category: "gift", done: false, type: "선택", item: "예단",         opt: "생략 / 간소화",  price: null, deposit: 0, status: "검토중", memo: "양가 합의" },

  /* 신혼 준비 */
  { category: "newlywed", done: false, type: "필수", item: "신혼집",   opt: "-",             price: null, deposit: 0, status: "검토중", memo: "" },
  { category: "newlywed", done: false, type: "필수", item: "혼수",     opt: "가전 · 가구",    price: null, deposit: 0, status: "검토중", memo: "필수/후구매/렌탈 3분류" },
  { category: "newlywed", done: false, type: "선택", item: "신혼여행", opt: "허니문",         price: null, deposit: 0, status: "검토중", memo: "여권 유효기간 확인" },

  /* 행정·비용 */
  { category: "admin", done: false, type: "필수", item: "상견례",      opt: "양가 첫 만남",   price: null, deposit: 0, status: "검토중", memo: "예물·예단 방향 합의" },
  { category: "admin", done: false, type: "필수", item: "예산 설정",   opt: "항목별 상한선",  price: null, deposit: 0, status: "검토중", memo: "혼수 예산 오버 주의" },
  { category: "admin", done: false, type: "필수", item: "혼인신고",    opt: "구청 접수",      price: null, deposit: 0, status: "검토중", memo: "신분증·가족관계증명서" },
];

const STATUSES = ["검토중", "예정", "계약", "완료"];
