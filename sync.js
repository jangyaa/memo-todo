'use strict';

/* =========================================================================
 * 클라우드 동기화 (Supabase)
 *
 * - 메인 프로세스에서만 동작한다. 렌더러는 IPC로만 접근한다.
 * - 전체 상태(JSON)를 사용자당 한 행(app_state)에 저장하는 단순 모델.
 * - 마지막에 저장한 쪽이 이긴다(last-write-wins, updated_at 비교).
 * - config.json 이 없거나 비어 있으면 동기화는 비활성, 앱은 로컬로만 동작.
 * ========================================================================= */

const fs = require('fs');
const path = require('path');

let createClient = null;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch (_) {
  // 의존성이 없으면 동기화 비활성 상태로만 동작
}

/* --- 세션을 파일에 저장하는 간단한 storage (로그인 유지용) --- */
class FileStorage {
  constructor(file) {
    this.file = file;
    try {
      this.cache = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (_) {
      this.cache = {};
    }
  }
  _persist() {
    try { fs.writeFileSync(this.file, JSON.stringify(this.cache), 'utf-8'); }
    catch (_) {}
  }
  getItem(k) { return this.cache[k] ?? null; }
  setItem(k, v) { this.cache[k] = v; this._persist(); }
  removeItem(k) { delete this.cache[k]; this._persist(); }
}

class Sync {
  constructor() {
    this.client = null;
    this.configured = false;
    this.libLoaded = !!createClient; // @supabase/supabase-js 로드 성공 여부(진단용)
    this.lastReason = 'init-안됨';    // 마지막 init 결과 사유(진단용)
    this.user = null;
    this.lastPushedAt = 0;     // 우리가 마지막으로 올린 시각(에코 무시용)
    this.onRemoteChange = null; // (data) => void  다른 기기 변경 콜백
  }

  hasLib() { return this.libLoaded; }
  reason() { return this.lastReason; }

  /* configDir: userData 경로. config: { supabaseUrl, supabaseAnonKey } */
  init(configDir, config) {
    if (!createClient) { this.lastReason = '라이브러리 미로드(@supabase/supabase-js)'; return; }
    if (!config) { this.lastReason = 'config.json 없음/못읽음'; return; }
    if (!config.supabaseUrl || !config.supabaseAnonKey) { this.lastReason = 'supabaseUrl/anonKey 키 누락'; return; }
    if (config.supabaseUrl.includes('여기에') ||
        config.supabaseAnonKey.includes('여기에')) { this.lastReason = '예시값 그대로'; return; } // 예시값 그대로면 무시

    const storage = new FileStorage(path.join(configDir, 'session.json'));
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    this.configured = true;
    this.lastReason = 'ok';
  }

  isConfigured() { return this.configured; }

  async currentUser() {
    if (!this.client) return null;
    const { data } = await this.client.auth.getUser();
    this.user = data ? data.user : null;
    return this.user;
  }

  async signUp(email, password) {
    if (!this.client) throw new Error('동기화가 설정되지 않았어요.');
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data.user;
  }

  async signIn(email, password) {
    if (!this.client) throw new Error('동기화가 설정되지 않았어요.');
    const { data, error } =
      await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data.user;
  }

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
  }

  /* 원격 상태 가져오기 → { data, updatedAt } | null */
  async pull() {
    if (!this.client || !this.user) return null;
    const { data, error } = await this.client
      .from('app_state')
      .select('data, updated_at')
      .eq('user_id', this.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { data: data.data, updatedAt: new Date(data.updated_at).getTime() };
  }

  /* 원격에 상태 저장(덮어쓰기) */
  async push(stateData) {
    if (!this.client || !this.user) return null;
    const now = new Date();
    const { error } = await this.client
      .from('app_state')
      .upsert({
        user_id: this.user.id,
        data: stateData,
        updated_at: now.toISOString()
      });
    if (error) throw error;
    this.lastPushedAt = now.getTime();
    return this.lastPushedAt;
  }

  /* 다른 기기의 변경을 실시간 구독 */
  subscribe() {
    if (!this.client || !this.user) return;
    if (this.channel) return;
    this.channel = this.client
      .channel('app_state_' + this.user.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_state',
        filter: 'user_id=eq.' + this.user.id
      }, (payload) => {
        const row = payload.new;
        if (!row || !row.updated_at) return;
        const ts = new Date(row.updated_at).getTime();
        // 우리가 방금 올린 변경이면 무시(에코 방지)
        if (Math.abs(ts - this.lastPushedAt) < 1500) return;
        if (this.onRemoteChange) this.onRemoteChange(row.data);
      })
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

module.exports = new Sync();
