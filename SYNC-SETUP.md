# ☁ 클라우드 동기화 설정 (비전공자용)

여러 기기에서 같은 할 일/메모를 보려면 "인터넷 저장소"가 하나 필요해요.
여기서는 **Supabase**(무료 등급)를 씁니다. 한 번만 설정하면 됩니다.
천천히 따라오면 돼요. 약 10분.

> ⚠️ 동기화는 **선택**이에요. 설정 안 해도 앱은 내 컴퓨터에서 그냥 잘 돌아갑니다.

---

## 1단계 · Supabase 가입 & 프로젝트 만들기

1. https://supabase.com 접속 → **Start your project** → 가입 (GitHub나 이메일).
2. **New project** 클릭.
   - Name: 아무거나 (예: `memo-todo`)
   - Database Password: 적당히 정하고 **메모해두기** (나중에 거의 안 씀)
   - Region: `Northeast Asia (Seoul)` 추천
3. **Create new project** → 1~2분 기다리면 준비됨.

## 2단계 · 연결 정보(주소 + 키) 복사

1. 왼쪽 메뉴 맨 아래 **⚙ Project Settings** → **API** 클릭.
2. 두 가지를 복사해 둡니다:
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **Project API keys → `anon` `public`** 키 (긴 문자열)

> `anon public` 키는 공개되어도 되는 키예요(아래 보안 규칙으로 내 데이터만 보이게 막습니다). `service_role` 키는 절대 쓰지 마세요.

## 3단계 · config.json 만들기

1. 앱 폴더에 있는 **`config.example.json`** 파일을 복사해서
   이름을 **`config.json`** 으로 바꿉니다.
2. 메모장으로 열어 2단계에서 복사한 값을 붙여넣고 저장:

```json
{
  "supabaseUrl": "https://abcd1234.supabase.co",
  "supabaseAnonKey": "여기에_복사한_anon_public_키"
}
```

## 4단계 · 저장 공간(표) 만들기

1. Supabase 왼쪽 메뉴 **SQL Editor** → **New query**.
2. 아래 내용을 **그대로 붙여넣고** 오른쪽 아래 **Run** 클릭:

```sql
-- 내 데이터 한 줄을 저장할 표
create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 보안: 로그인한 본인 데이터만 보고/쓰게 제한
alter table public.app_state enable row level security;

create policy "own select" on public.app_state
  for select using (auth.uid() = user_id);
create policy "own insert" on public.app_state
  for insert with check (auth.uid() = user_id);
create policy "own update" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 실시간 동기화 켜기
alter publication supabase_realtime add table public.app_state;
```

"Success. No rows returned" 이 뜨면 성공이에요.

## 5단계 · (권장) 이메일 확인 끄기

가입을 간단히 하려면 이메일 확인을 꺼두는 게 편해요.

1. 왼쪽 메뉴 **Authentication** → **Sign In / Providers** (또는 **Providers → Email**).
2. **Confirm email** 옵션을 **꺼짐(Off)** 으로.
3. 저장.

> 끄지 않으면, 가입 후 메일로 온 확인 링크를 눌러야 로그인됩니다.

## 6단계 · 앱에서 로그인

1. 앱 실행 (`npm start`).
2. 오른쪽 위 **☁ 버튼** 클릭.
3. 이메일/비밀번호 입력 후 **회원가입** → 그다음 **로그인**.
4. ✅ 표시가 뜨면 끝! 이제 같은 계정으로 다른 컴퓨터에서 로그인하면 동기화됩니다.

---

## 자주 묻는 것

- **다른 컴퓨터에서 쓰려면?** 그 컴퓨터에도 앱 + 같은 `config.json` 을 두고, 같은 계정으로 로그인하면 됩니다.
- **데이터가 안 맞아요.** ☁ 패널의 **지금 동기화** 버튼을 눌러보세요. 규칙은 "마지막에 저장한 내용이 최신"입니다.
- **아이폰에서도 되나요?** 이 저장소(Supabase)는 그대로 두고, 나중에 아이폰용 화면만 따로 붙이면 됩니다. (위젯은 별도 작업)
