# 실사용 검증 체크리스트 (Supabase 초보자용)

이 문서의 SQL 블록은 전부 **그대로 복사해서 붙여넣기만 하면 되도록** 만들어졌습니다.
딱 한 군데, 3단계에서 본인 매장 이름/이메일을 넣는 부분만 고치면 됩니다 (SQL
문법을 직접 쓰는 게 아니라, 이미 써 있는 값 3개를 바꾸는 것뿐입니다).

이 샌드박스는 사용자의 실제 Supabase/Vercel/OpenAI 계정에 접근할 수 없어서,
아래는 전부 **사용자가 직접** 클릭/붙여넣기 해야 합니다.

---

## 1단계 — 테이블 + 버킷 만들기

**어디 클릭:**
1. [supabase.com](https://supabase.com) 접속 → 본인 프로젝트 열기
2. 왼쪽 메뉴에서 **SQL Editor** 클릭
3. 오른쪽 위 **New query** 클릭

**어떤 SQL 실행:** 아래 블록 전체를 복사해서 에디터에 붙여넣고, 오른쪽 아래
**Run** 버튼(또는 Ctrl+Enter) 클릭.

<details>
<summary>여기를 눌러 SQL 펼치기 (클릭)</summary>

```sql
-- ============================================================================
-- 0001_core_schema.sql — tenant root + customers + the unified orders table
-- ============================================================================
create extension if not exists pgcrypto;

create table if not exists stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  timezone    text not null default 'Asia/Seoul',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table stores enable row level security;

create table if not exists store_members (
  id        uuid primary key default gen_random_uuid(),
  store_id  uuid not null references stores(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);
alter table store_members enable row level security;

create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  phone         text,
  created_at    timestamptz not null default now(),
  unique (store_id, auth_user_id)
);
alter table customers enable row level security;

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete restrict,
  order_type      text not null check (order_type in ('catalog', 'custom')),
  status          text not null,
  pickup_date     date not null,
  pickup_time     time not null,
  cake_message    text,
  description         text,
  ai_preview_path     text,
  ai_preview_prompt    text,
  quoted_price_krw    integer,
  customer_note   text,
  privacy_consent_given_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists orders_store_id_idx on orders (store_id, created_at desc);
create index if not exists orders_customer_id_idx on orders (customer_id);
alter table orders enable row level security;

-- ============================================================================
-- 0002_core_rls.sql
-- ============================================================================
drop policy if exists "members can view their own store" on stores;
create policy "members can view their own store"
on stores for select to authenticated
using (id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can view their own membership rows" on store_members;
create policy "members can view their own membership rows"
on store_members for select to authenticated
using (user_id = auth.uid());

drop policy if exists "customers can view their own row" on customers;
create policy "customers can view their own row"
on customers for select to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "customers can insert their own row" on customers;
create policy "customers can insert their own row"
on customers for insert to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists "members can view their store's customers" on customers;
create policy "members can view their store's customers"
on customers for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "customers can view their own orders" on orders;
create policy "customers can view their own orders"
on orders for select to authenticated
using (customer_id in (select id from customers where auth_user_id = auth.uid()));

drop policy if exists "customers can insert their own orders" on orders;
create policy "customers can insert their own orders"
on orders for insert to authenticated
with check (customer_id in (select id from customers where auth_user_id = auth.uid()));

drop policy if exists "members can view their store's orders" on orders;
create policy "members can view their store's orders"
on orders for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's orders" on orders;
create policy "members can update their store's orders"
on orders for update to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ============================================================================
-- 0003_catalog_designs.sql
-- ============================================================================
create table if not exists store_catalog_designs (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  label               text not null,
  image_path          text not null,
  price_krw           integer not null check (price_krw > 0),
  is_enabled          boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists store_catalog_designs_store_idx on store_catalog_designs (store_id, sort_order);
alter table store_catalog_designs enable row level security;

alter table orders
  add column if not exists catalog_design_id     uuid references store_catalog_designs(id) on delete set null,
  add column if not exists catalog_design_label   text,
  add column if not exists price_krw              integer,
  add column if not exists payment_provider        text,
  add column if not exists payment_transaction_id  text,
  add column if not exists paid_at                 timestamptz;

-- ============================================================================
-- 0004_catalog_designs_rls.sql
-- ============================================================================
drop policy if exists "members can view their store's catalog designs" on store_catalog_designs;
create policy "members can view their store's catalog designs"
on store_catalog_designs for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can insert their store's catalog designs" on store_catalog_designs;
create policy "members can insert their store's catalog designs"
on store_catalog_designs for insert to authenticated
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's catalog designs" on store_catalog_designs;
create policy "members can update their store's catalog designs"
on store_catalog_designs for update to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ============================================================================
-- 0005_reference_images.sql
-- ============================================================================
create table if not exists reference_images (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  storage_path  text not null,
  position      integer not null check (position between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (order_id, position)
);
alter table reference_images enable row level security;

drop policy if exists "customers can view their own order's reference images" on reference_images;
create policy "customers can view their own order's reference images"
on reference_images for select to authenticated
using (order_id in (select o.id from orders o join customers c on c.id = o.customer_id where c.auth_user_id = auth.uid()));

drop policy if exists "customers can insert reference images for their own orders" on reference_images;
create policy "customers can insert reference images for their own orders"
on reference_images for insert to authenticated
with check (order_id in (select o.id from orders o join customers c on c.id = o.customer_id where c.auth_user_id = auth.uid()));

drop policy if exists "members can view their store's reference images" on reference_images;
create policy "members can view their store's reference images"
on reference_images for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ============================================================================
-- 0006_payment_settings.sql
-- ============================================================================
create table if not exists store_payment_settings (
  store_id               uuid primary key references stores(id) on delete cascade,
  bank_name              text,
  bank_account_number    text,
  bank_account_holder    text,
  payment_instructions   text,
  payment_deadline_hours integer not null default 24,
  updated_at             timestamptz not null default now()
);
alter table store_payment_settings enable row level security;

drop policy if exists "members can view their store's payment settings" on store_payment_settings;
create policy "members can view their store's payment settings"
on store_payment_settings for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can upsert their store's payment settings" on store_payment_settings;
create policy "members can upsert their store's payment settings"
on store_payment_settings for insert to authenticated
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's payment settings" on store_payment_settings;
create policy "members can update their store's payment settings"
on store_payment_settings for update to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ============================================================================
-- 0007_pickup_scheduling.sql
-- ============================================================================
create table if not exists store_pickup_settings (
  store_id               uuid primary key references stores(id) on delete cascade,
  pickup_interval_minutes integer not null default 30 check (pickup_interval_minutes in (15, 30, 60))
);
create table if not exists store_pickup_day_settings (
  store_id        uuid not null references stores(id) on delete cascade,
  weekday         integer not null check (weekday between 0 and 6),
  is_enabled      boolean not null default false,
  opening_time    time,
  closing_time    time,
  min_lead_hours  integer,
  primary key (store_id, weekday)
);
alter table store_pickup_settings enable row level security;
alter table store_pickup_day_settings enable row level security;

drop policy if exists "members can view their store's pickup settings" on store_pickup_settings;
create policy "members can view their store's pickup settings"
on store_pickup_settings for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can upsert their store's pickup settings" on store_pickup_settings;
create policy "members can upsert their store's pickup settings"
on store_pickup_settings for insert to authenticated
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's pickup settings" on store_pickup_settings;
create policy "members can update their store's pickup settings"
on store_pickup_settings for update to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can view their store's pickup day settings" on store_pickup_day_settings;
create policy "members can view their store's pickup day settings"
on store_pickup_day_settings for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can upsert their store's pickup day settings" on store_pickup_day_settings;
create policy "members can upsert their store's pickup day settings"
on store_pickup_day_settings for insert to authenticated
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

drop policy if exists "members can update their store's pickup day settings" on store_pickup_day_settings;
create policy "members can update their store's pickup day settings"
on store_pickup_day_settings for update to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ============================================================================
-- 0008_payment_method_and_webhook.sql
-- ============================================================================
alter table orders add column if not exists payment_method text;

create unique index if not exists orders_payment_transaction_id_uidx
  on orders (payment_transaction_id) where payment_transaction_id is not null;

create table if not exists payment_webhook_events (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid references stores(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  event_type  text not null,
  payment_key text,
  toss_status text,
  raw_payload jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists payment_webhook_events_order_id_idx on payment_webhook_events (order_id);
alter table payment_webhook_events enable row level security;

drop policy if exists "members can view their store's webhook events" on payment_webhook_events;
create policy "members can view their store's webhook events"
on payment_webhook_events for select to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()));

-- ============================================================================
-- 0009_storage_buckets.sql
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog-designs', 'catalog-designs', false, 4194304, array['image/jpeg', 'image/png', 'image/webp']),
  ('ai-previews', 'ai-previews', false, 8388608, array['image/png', 'image/jpeg']),
  ('reference-images', 'reference-images', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
```

</details>

**정상 결과:** 화면 아래쪽에 초록색 **"Success. No rows returned"** 가 뜹니다.

**실패 시 나올 수 있는 에러:**
- `ERROR: syntax error at or near ...` → 복사가 중간에 끊겼을 가능성이 큽니다.
  펼치기 버튼을 다시 눌러서 **전체를 처음부터 끝까지** 다시 복사해보세요.
- `ERROR: permission denied for schema storage` → 매우 드문 경우로, 프로젝트
  플랜/권한 문제입니다. 이 경우 캡처해서 알려주시면 버킷은 대시보드
  **Storage** 메뉴에서 수동으로 만드는 대안 안내를 드리겠습니다.
- 이미 한 번 실행한 적이 있다면 다시 실행해도 에러 없이 그냥 성공합니다
  (전부 재실행 안전하게 작성되어 있습니다).

---

## 2단계 — 관리자(사장님) 계정 만들기

**어디 클릭:**
1. 왼쪽 메뉴 **Authentication** 클릭 → 위쪽 탭에서 **Users** 클릭
2. 오른쪽 위 **Add user** 버튼 클릭 → **Create new user** 선택

**무엇을 입력:**
- Email: 관리자로 쓸 이메일 (예: `admin@mystore.com`)
- Password: 비밀번호
- **"Auto Confirm User"** 체크박스를 반드시 체크 (이메일 인증 메일 없이 바로
  로그인되게 하기 위함)
- **Create user** 클릭

**정상 결과:** Users 목록에 방금 만든 이메일이 보이고, 상태가 초록색
"Confirmed"로 표시됩니다. 이 이메일을 3단계에서 그대로 씁니다.

**실패 시 에러:**
- `User already registered` → 이미 쓰고 있는 이메일입니다. 목록에서 찾아서
  그대로 쓰거나 다른 이메일로 다시 만드세요.

---

## 3단계 — 매장 생성 + 관리자 연결 (한 번에 붙여넣기)

**어디 클릭:** 1단계와 동일 — **SQL Editor** → **New query**

**어떤 SQL 실행:** 아래 블록을 복사한 뒤, **맨 위 3줄의 값만** 본인 것으로
바꾸고 붙여넣어 **Run**.

```sql
do $$
declare
  -- ⬇️⬇️ 이 3줄만 본인 값으로 바꾸세요 ⬇️⬇️
  v_store_slug  text := 'my-store';           -- 매장 주소에 쓸 영문 slug (공백/한글 금지)
  v_store_name  text := '내 케이크 가게';        -- 매장 이름 (화면에 보이는 이름)
  v_admin_email text := 'admin@mystore.com';  -- 2단계에서 만든 관리자 이메일
  -- ⬆️⬆️ 여기까지만 바꾸면 됩니다 ⬆️⬆️
  v_store_id uuid;
  v_user_id  uuid;
begin
  select id into v_user_id from auth.users where email = v_admin_email;

  if v_user_id is null then
    raise exception '관리자 계정을 찾을 수 없습니다. 2단계에서 만든 이메일과 정확히 일치하는지 확인하세요: %', v_admin_email;
  end if;

  insert into stores (slug, name, timezone)
  values (v_store_slug, v_store_name, 'Asia/Seoul')
  returning id into v_store_id;

  insert into store_members (store_id, user_id)
  values (v_store_id, v_user_id);

  raise notice '매장 생성 완료 — slug: %, store_id: %', v_store_slug, v_store_id;
end $$;
```

**정상 결과:** 초록색 "Success" 메시지와 함께, 화면 하단 **Results**(또는
**Logs/Notices**) 영역에 다음과 같은 메시지가 보입니다:

```
NOTICE: 매장 생성 완료 — slug: my-store, store_id: ...
```

이 메시지가 안 보여도 괜찮습니다 — 에러 없이 "Success"만 떴다면 정상입니다.

**실패 시 에러:**
- `관리자 계정을 찾을 수 없습니다 ...` → 2단계 이메일과 3단계에 적은
  이메일이 한 글자라도 다릅니다. Authentication → Users 목록에서 정확한
  이메일을 복사해서 다시 넣으세요.
- `ERROR: duplicate key value violates unique constraint "stores_slug_key"` →
  그 slug로 매장을 이미 만들었습니다. slug를 다른 값으로 바꿔서 다시
  실행하거나, 그냥 다음 단계로 넘어가세요 (이미 만들어진 것입니다).

---

## 4단계 — 잘 만들어졌는지 확인

**어떤 SQL 실행:**

```sql
select s.slug, s.name, u.email
from stores s
join store_members sm on sm.store_id = s.id
join auth.users u on u.id = sm.user_id;
```

**정상 결과:** 아래처럼 **한 줄**이 보여야 합니다 (3단계에서 적은 값과
일치해야 함):

| slug | name | email |
|---|---|---|
| my-store | 내 케이크 가게 | admin@mystore.com |

**결과가 비어 있다면:** 3단계가 실제로 실행되지 않았거나 에러가 났던
것입니다. 3단계로 돌아가세요.

---

## 5단계 — 환경변수 설정

**어디서 키 복사:**
1. Supabase 대시보드 → 왼쪽 아래 톱니바퀴 **Project Settings** 클릭
2. **API** 탭 클릭
3. **Project URL**, **anon public** 키, **service_role** 키(옆의 "Reveal"
   눌러야 보임)를 각각 복사

**어디에 붙여넣기 (둘 중 실제로 테스트할 곳):**

- **로컬에서 테스트**: 프로젝트 폴더에 `.env.local` 파일을 만들고 아래
  형식으로 붙여넣기
- **Vercel에 올려서 테스트**: Vercel 대시보드 → 프로�트 → **Settings** →
  **Environment Variables** → 아래 각 줄을 Key/Value로 하나씩 **Add**

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL 붙여넣기>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public 키 붙여넣기>
SUPABASE_SERVICE_ROLE_KEY=<service_role 키 붙여넣기>
OPENAI_API_KEY=<OpenAI API 키>
TOSS_SECRET_KEY=test_placeholder
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_placeholder
```

(Toss 두 줄은 지금 단계에서 결제를 직접 눌러보지 않는다면 저렇게 임시
문자열만 넣어도 됩니다 — 값이 "있기만" 하면 되고, 실제로 Toss에 맞는 키인지는
결제를 시도할 때만 문제가 됩니다.)

**정상 결과:** Vercel이면 Environment Variables 목록에 6개 변수가 전부
보입니다. **Vercel이라면 변수 추가 후 반드시 "Redeploy"를 한 번 눌러야
적용됩니다** (안 그러면 예전 설정으로 계속 돌아갑니다).

**실패 시 에러:** 앱 접속 시 `[env] Missing or empty required environment
variable(s): ...` 라는 에러 화면이 뜨면, 메시지에 적힌 변수 이름을 그대로
찾아서 빠졌는지 확인하세요.

---

## 6단계 — 관리자 로그인 테스트

**접속:** `<도메인>/admin/login` (로컬이면 `http://localhost:3000/admin/login`)

**입력:**
- 매장 URL (slug): 3단계에서 정한 값 (예: `my-store`)
- 이메일/비밀번호: 2단계에서 만든 값

**정상 결과:** 로그인 후 "해당하는 주문이 없습니다"라고 뜨는 주문 목록
화면으로 이동합니다.

**실패 시 에러:**
- "이메일 또는 비밀번호가 올바르지 않습니다" → 2단계에서 "Auto Confirm
  User"를 체크하지 않았을 가능성이 있습니다. Authentication → Users에서
  해당 유저를 열어 confirm 상태를 확인하세요.
- "매장을 찾을 수 없거나 접근 권한이 없습니다" → slug를 잘못 입력했거나,
  4단계 확인 결과가 비어있던 경우입니다. 4단계부터 다시 확인하세요.

---

## 7단계 — 매장 설정 (디자인/계좌/픽업 등록)

**접속:** `<도메인>/admin/<slug>/settings` (로그인된 상태에서 상단
"매장 설정" 링크로도 이동 가능)

**해볼 것:**
- "새 디자인 추가"에 이름/가격 입력 + 이미지 선택 → **디자인 등록** 클릭
- 입금 계좌 정보 입력 → **결제 설정 저장** 클릭
- 픽업 요일별 영업시간 체크 → **픽업 설정 저장** 클릭

**정상 결과:** 등록한 디자인이 썸네일과 함께 목록에 나타나고, 저장 버튼을
누르면 초록색 저장 완료 문구가 뜹니다.

**실패 시 에러:**
- "이미지를 저장하지 못했습니다" → 1단계의 버킷 생성 SQL이 제대로
  실행됐는지, `SUPABASE_SERVICE_ROLE_KEY` 환경변수가 정확한지 확인하세요.

---

## 8단계 — 고객 플로우 테스트 (Toss 없이 끝까지 되는 Flow B)

**접속:** `<도메인>/s/<slug>/custom`

1. 케이크 설명 입력 → **AI 미리보기 생성** → 이미지가 실제로 생성되는지
   (여기서 OpenAI 실제 과금 발생)
2. 참고 사진 1~3장 업로드 → 썸네일 보이는지
3. 픽업 날짜/시간/이름/전화번호 입력 + 동의 체크 → 제출
4. "요청이 접수되었습니다" 화면에서 **주문 상태 확인하기** 클릭
5. 관리자 주문 목록(`/admin/<slug>/orders`)에 새 주문이 "견적 대기"로
   보이는지 확인
6. 주문 상세에서 AI 미리보기와 참고 사진이 따로 표시되는지 확인 → 견적
   금액 입력 → 저장
7. 고객 쪽 주문 상태 페이지를 새로고침 → 입금 계좌 안내가 뜨는지 확인
8. 관리자에서 상태를 "결제 완료" → "제작 중" → "픽업 대기" → "완료" 순서로
   바꿔가며, 순서를 건너뛰는 전환이 막히는지 확인

**Flow A(`/s/<slug>/catalog`)는 디자인 노출까지만 확인하면 됩니다** — "결제
하기"를 누르면 Toss 위젯 스크립트는 뜨지만 테스트 키가 없어 여기서 멈추는 게
정상입니다 (의도된 보류 지점).

---

막히는 단계가 있으면 **몇 단계에서, 정확히 어떤 에러 문구가 떴는지** 그대로
알려주세요. 코드나 SQL을 바로 고쳐드리겠습니다.
