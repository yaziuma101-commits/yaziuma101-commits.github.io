// レバガチャファイターヌスの曲の切り替え（戦闘の曲 → 試合の終わりの勝ち／負けの曲）。
// three.js・DOM・Web Audio に依存しない。音を鳴らす関数（ensure / stop）は引数で受け取る。
import {
  LF_BATTLE_TRACK, setLfMusicMode, lfMusicMode, lfTrackNameForMode,
} from './audio-music.js';

export const LF_MUSIC_MODES = Object.freeze(['battle', 'win', 'lose']);

/**
 * 勝ったラウンド数から曲の種類を決める。
 * 0-0 は戦闘（新しい試合）、片方だけが target に届いたら勝ち／負け、それ以外は変えない（null）
 */
export function lfMusicModeForWins(p, e, target = 2) {
  const pw = Math.max(0, Math.floor(Number(p) || 0));
  const ew = Math.max(0, Math.floor(Number(e) || 0));
  const t = Math.max(1, Math.floor(Number(target) || 2));
  if (pw === 0 && ew === 0) return 'battle';
  if (pw >= t && ew < t) return 'win';
  if (ew >= t && pw < t) return 'lose';
  return null;
}

/** 試合の勝者（lf-match の winner）→ 曲の種類 */
export function lfMusicModeForWinner(winner) {
  if (winner === 'player') return 'win';
  if (winner === 'enemy') return 'lose';
  return 'battle';
}

/**
 * 曲の切り替え役。曲の名前は 'lever-fighter' のまま、中身（trackByName の結果）を入れ替えて
 * 止めて鳴らし直す。場面が毎フレーム 'lever-fighter' を求めても、戦闘の曲に戻らない。
 */
export function createLfMusicDriver({ ensure = null, stop = null } = {}) {
  const set = (mode) => {
    const next = LF_MUSIC_MODES.includes(mode) ? mode : 'battle';
    if (next === lfMusicMode()) return false;
    setLfMusicMode(next);
    try {
      if (typeof stop === 'function') stop(LF_BATTLE_TRACK);
      if (typeof ensure === 'function') ensure(LF_BATTLE_TRACK);
    } catch {
      // 音が鳴らなくても試合は続ける
    }
    return true;
  };
  return {
    get mode() { return lfMusicMode(); },
    /** いま鳴っている（はずの）曲の名前 */
    get trackName() { return lfTrackNameForMode(lfMusicMode()); },
    set,
    noteWins(p, e, target) {
      const m = lfMusicModeForWins(p, e, target);
      return m ? set(m) : false;
    },
    noteWinner(winner) {
      return set(lfMusicModeForWinner(winner));
    },
    /** 場面を出るとき：音には触らず、次に入ったときは戦闘の曲から */
    reset() {
      setLfMusicMode('battle');
    },
  };
}
