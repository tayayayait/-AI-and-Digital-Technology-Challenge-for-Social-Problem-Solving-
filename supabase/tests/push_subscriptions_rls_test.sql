begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'push_subscriptions', 'push_subscriptions 테이블이 존재한다');
select col_is_pk('public', 'push_subscriptions', 'id', 'id가 기본 키다');
select col_is_unique('public', 'push_subscriptions', 'endpoint', 'endpoint가 고유하다');
select policies_are(
  'public',
  'push_subscriptions',
  array[
    'push_subscriptions_delete_own',
    'push_subscriptions_insert_own',
    'push_subscriptions_select_own',
    'push_subscriptions_update_own'
  ],
  '소유자별 CRUD 정책만 정의한다'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'push-owner@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'push-other@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000101';

select lives_ok(
  $$
    insert into public.push_subscriptions (
      user_id, endpoint, p256dh, auth, region_lat, region_lng
    )
    values (
      '00000000-0000-0000-0000-000000000101',
      'https://push.example.test/owner',
      'owner-p256dh',
      'owner-auth',
      37.12349,
      127.12349
    )
  $$,
  '인증 사용자는 자신의 구독을 추가할 수 있다'
);

select results_eq(
  $$
    select region_lat::numeric(6, 3), region_lng::numeric(6, 3)
    from public.push_subscriptions
    where endpoint = 'https://push.example.test/owner'
  $$,
  $$ values (37.123::numeric(6, 3), 127.123::numeric(6, 3)) $$,
  '위치는 소수점 셋째 자리로 저장한다'
);

select throws_ok(
  $$
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      '00000000-0000-0000-0000-000000000102',
      'https://push.example.test/other',
      'other-p256dh',
      'other-auth'
    )
  $$,
  '42501',
  null,
  '다른 사용자의 구독은 추가할 수 없다'
);

reset role;

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (
  '00000000-0000-0000-0000-000000000102',
  'https://push.example.test/other',
  'other-p256dh',
  'other-auth'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000101';

select results_eq(
  $$ select count(*)::integer from public.push_subscriptions $$,
  array[1],
  '인증 사용자는 자신의 구독만 조회한다'
);

select results_eq(
  $$
    with updated as (
      update public.push_subscriptions
      set alert_threshold = 'WATCH'
      where endpoint = 'https://push.example.test/other'
      returning id
    )
    select count(*)::integer from updated
  $$,
  array[0],
  '인증 사용자는 다른 사용자의 구독을 수정할 수 없다'
);

select lives_ok(
  $$
    insert into public.push_subscriptions (
      user_id, endpoint, p256dh, auth, alert_threshold
    )
    values (
      '00000000-0000-0000-0000-000000000101',
      'https://push.example.test/owner',
      'owner-p256dh-updated',
      'owner-auth-updated',
      'CRITICAL'
    )
    on conflict (endpoint) do update
    set
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      alert_threshold = excluded.alert_threshold
  $$,
  '같은 endpoint는 중복 행 없이 갱신할 수 있다'
);

select results_eq(
  $$
    select count(*)::integer, max(alert_threshold)
    from public.push_subscriptions
    where endpoint = 'https://push.example.test/owner'
  $$,
  $$ values (1, 'CRITICAL'::text) $$,
  'endpoint upsert 결과가 한 행에 반영된다'
);

set local role anon;

select throws_ok(
  $$ select count(*)::integer from public.push_subscriptions $$,
  '42501',
  null,
  '익명 사용자는 구독을 직접 조회할 수 없다'
);

select throws_ok(
  $$
    insert into public.push_subscriptions (endpoint, p256dh, auth)
    values ('https://push.example.test/anon', 'anon-p256dh', 'anon-auth')
  $$,
  '42501',
  null,
  '익명 사용자는 Edge Function을 거치지 않고 구독을 추가할 수 없다'
);

reset role;

select * from finish();
rollback;
