# 실사용 검증 가이드

이 레포는 지금까지 이 세션(샌드박스) 안에서 `tsc`/`next build`/`eslint`로만
검증되었고, 실제 Supabase/OpenAI/Toss 자격증명으로 실행된 적이 한 번도
없습니다. 이 샌드박스는 사용자의 Supabase/Vercel/OpenAI 계정에 접근할 수
없으므로, 아래 단계는 **사용자가 직접** 수행해야 합니다.

## 1. Supabase — 마이그레이션 적용

기존 Supabase 프로젝트를 그대로 사용합니다 (새로 만들지 않음).

- Supabase 대시보드 → SQL Editor에서 `supabase/APPLY_ALL.sql` 내용을 한 번에
  붙여넣고 실행하면 0001~0009 마이그레이션이 순서대로 적용됩니다.
  (개별 파일을 순서대로 실행해도 동일합니다.)
- 0009는 `catalog-designs` / `ai-previews` / `reference-images` 스토리지
  버킷을 생성합니다 — **이게 없으면 이미지 업로드가 전부 "bucket not
  found"로 실패**하니 반드시 포함해서 실행해 주세요.
- 모든 마이그레이션은 재실행해도 안전합니다 (`if not exists` / `on conflict
  do nothing`).

## 2. 관리자 계정 + 매장 생성

1. Supabase 대시보드 → Authentication → Users → **Add user**로 관리자
   이메일/비밀번호 계정을 하나 만듭니다. 생성된 사용자의 UID를 복사해
   둡니다.
2. SQL Editor에서 매장과 멤버십을 생성합니다 (아래를 실제 값으로 바꿔서
   실행):

```sql
insert into stores (slug, name, timezone)
values ('my-store', '내 매장 이름', 'Asia/Seoul')
returning id;
-- 위에서 나온 store id를 복사해 아래에 사용

insert into store_members (store_id, user_id)
values ('<위에서 나온 store id>', '<1번에서 복사한 auth user UID>');
```

3. `/admin/login`에서 매장 slug + 1번 이메일/비밀번호로 로그인 →
   `/admin/my-store/settings`에서 디자인 1~2개, 입금 계좌, 픽업 요일을
   등록합니다.

## 3. 환경변수

로컬 검증(`npm run dev`)이면 `.env.local`, Vercel에 올려서 검증하면 해당
프로젝트의 Environment Variables에 다음을 설정합니다 (`.env.example` 참고):

| 변수 | 비고 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 기존 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 기존 프로젝트 anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 기존 프로젝트 service role key — **절대 커밋/공유 금지** |
| `OPENAI_API_KEY` | Flow B AI 미리보기 생성에 실제로 사용됨 — 실과금 발생 |
| `TOSS_SECRET_KEY` | Toss 결제는 보류 중이지만, `getEnv()`가 값이 있어야 통과시킴 — 지금은 Toss 테스트 연동키(무료) 또는 임시 문자열이면 충분, 실제 결제 테스트 전까지는 동작 안 해도 무방 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 위와 동일 사유 |
| `NEXT_PUBLIC_SITE_URL` | 선택, 비워도 동작 |

Toss 쪽 두 값은 지금 단계에서 **실제로 결제를 시도하지 않는다면** 아무
문자열이나 넣어도 됩니다 — `getEnv()`는 "값이 존재하는지"만 검사하고,
Toss 서버에 실제로 맞는 키인지는 결제를 시도할 때만 드러납니다.

## 4. 로컬 실행

```bash
npm install
npm run dev
```

- 관리자: `http://localhost:3000/admin/login`
- 고객 진입점: `http://localhost:3000/s/my-store`

## 5. 검증해 볼 체크리스트

**Flow B (AI 오더메이드) — Toss 없이 끝까지 가능한 흐름:**
- [ ] `/s/my-store/custom`에서 설명 입력 → "AI 미리보기 생성" → 실제
      OpenAI 호출로 이미지가 나오는지 (여기서 실과금 발생)
- [ ] 참고 사진 1~3장 업로드 → 썸네일이 보이는지
- [ ] 제출 → "요청이 접수되었습니다" 화면 → "주문 상태 확인하기"로 이동
- [ ] 관리자 `/admin/my-store/orders`에 새 주문이 `견적 대기` 상태로
      보이는지
- [ ] 주문 상세에서 AI 미리보기 + 참고 사진이 분리되어 보이는지, 참고
      사진이 "제작 기준"으로 라벨링되어 있는지
- [ ] 견적 금액 입력 → 저장 → 상태가 `결제 대기`로 바뀌는지
- [ ] 고객 쪽 주문 상태 페이지를 새로고침하면 입금 계좌 안내가 뜨는지
- [ ] 관리자에서 상태를 `결제 완료` → `제작 중` → `픽업 대기` →
      `완료`로 수동 전환이 되는지, 역방향/건너뛰기 전환은 막히는지

**Flow A (기존 케이크 주문) — 카탈로그 노출까지만 (Toss 결제는 보류):**
- [ ] 관리자에서 등록한 디자인이 `/s/my-store/catalog`에 뜨는지
- [ ] 디자인 선택 + 케이크 문구 입력 시 미리보기 캡션이 뜨는지
- [ ] "결제하기" 버튼을 눌렀을 때 Toss 위젯 스크립트는 로드되지만, 테스트
      키가 아니라면 여기서 멈추는 게 정상입니다 (의도된 보류 지점)

문제가 발견되면 어떤 단계에서 어떤 에러 메시지가 나왔는지 그대로 알려주시면
코드/마이그레이션을 바로 수정하겠습니다.
