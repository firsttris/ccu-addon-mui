import { dayName } from '../../lib/format';
import { m } from '../../paraglide/messages';
import {
  ALL_DAYS,
  DAYS,
  formatTime,
  WEEKEND,
  type WeekProgramEntry,
  type WeekProgramKind,
  WORKDAYS,
} from './weekProgram';

// How the week program shows days, times and levels

export const formatDays = (mask: number) => {
  if (mask === ALL_DAYS) return m.EVERY_DAY();
  if (mask === WORKDAYS) return m.WORKDAYS();
  if (mask === WEEKEND) return m.WEEKEND();
  return DAYS.map((day, i) => ((mask & day.bit) !== 0 ? dayName(i, 'short') : null))
    .filter(Boolean)
    .join(', ');
};

// WP_LEVEL above 1 are special values ("old level", "unchanged")
export const isSpecial = (level: number) => level > 1;

export const levelText = (kind: WeekProgramKind, level: number) => {
  if (isSpecial(level)) return level < 1.008 ? m.WP_OLD_LEVEL() : m.WP_UNCHANGED();
  if (kind === 'switch') return level > 0 ? m.ON() : m.OFF();
  if (kind === 'blind')
    return level === 0 ? m.BLIND_CLOSED() : m.BLIND_PERCENT_OPEN({ percent: Math.round(level * 100) });
  return level === 0 ? m.OFF() : m.DIMMED_TO({ percent: Math.round(level * 100) });
};

export const timeText = (entry: WeekProgramEntry) => {
  const offset = entry.astroOffset ? ` ${entry.astroOffset > 0 ? '+' : '−'}${Math.abs(entry.astroOffset)} min` : '';
  const astro = `${entry.astroType === 0 ? m.SUNRISE() : m.SUNSET()}${offset}`;
  if (entry.condition === 0) return formatTime(entry.hour, entry.minute);
  if (entry.condition === 1) return astro;
  // Combinations of both, as the WebUI offers them
  return `${formatTime(entry.hour, entry.minute)} / ${astro}`;
};
