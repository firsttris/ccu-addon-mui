import { type ReactNode, useState } from 'react';
import type { TimeModule } from '../../types/protocol';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { cn } from '../../lib/utils';
import {
  clockOf,
  clockOfSeconds,
  dateOf,
  describeTimeModule,
  secondsOfClock,
  SUN,
  TIMER,
  type TimeMode,
  timeModeOf,
  timeOfClock,
  type TimeTexts,
  today,
  WEEKDAYS,
  WEEKEND_BITS,
  WORKDAY_BITS,
} from './programModel';

// The time control of a condition, with everything the WebUI's time module
// dialog offers (rega/pages/tabs/admin/msg/timemodule.htm): a point in time
// or a range (also all day, during the day or at night by the sun), a
// repetition and the dates it applies.

export const useTimeTexts = (): TimeTexts => {
  const locale = getLocale();
  return {
    locale,
    // 2024-01-01 was a Monday
    weekday: (i, style) =>
      new Intl.DateTimeFormat(locale, { weekday: style }).format(new Date(2024, 0, 1 + Math.max(0, i))),
    month: (i) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, Math.max(0, i), 1)),
    t: {
      at: (clock) => m.PRG_TM_S_AT({ clock }),
      range: (from, to) => m.PRG_TM_S_RANGE({ from, to }),
      allDay: m.PRG_TM_S_ALL_DAY(),
      daytime: m.PRG_TM_S_DAYTIME(),
      nighttime: m.PRG_TM_S_NIGHTTIME(),
      once: (date) => m.PRG_TM_S_ONCE({ date }),
      every: (interval) => m.PRG_TM_S_EVERY({ interval }),
      daily: m.PRG_TM_S_DAILY(),
      everyNDays: (n) => m.PRG_TM_S_EVERY_N_DAYS({ n }),
      workdays: m.PRG_TM_S_WORKDAYS(),
      weekend: m.PRG_TM_S_WEEKEND(),
      weekly: (days) => m.PRG_TM_S_WEEKLY({ days }),
      everyNWeeks: (n, days) => m.PRG_TM_S_EVERY_N_WEEKS({ n, days }),
      monthlyDay: (day, n) => m.PRG_TM_S_MONTHLY_DAY({ day, n }),
      monthlyNth: (nth, day, n) => m.PRG_TM_S_MONTHLY_NTH({ nth, day, n }),
      yearlyDay: (day, month) => m.PRG_TM_S_YEARLY_DAY({ day, month }),
      yearlyNth: (nth, day, month) => m.PRG_TM_S_YEARLY_NTH({ nth, day, month }),
      hours: (n) => m.PRG_TM_S_HOURS({ n }),
      minutes: (n) => m.PRG_TM_S_MINUTES({ n }),
      seconds: (n) => m.PRG_TM_S_SECONDS({ n }),
    },
  };
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
    <legend className="px-1 text-sm font-medium">{title}</legend>
    {children}
  </fieldset>
);

const Labeled = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-wrap items-center gap-2 text-sm">
    <span className="min-w-24 text-muted-foreground">{label}</span>
    {children}
  </label>
);

const Choice = ({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) => (
  <label className="flex items-center gap-2 text-sm">
    <input type="radio" name={name} checked={checked} onChange={onChange} />
    {label}
  </label>
);

const numberClass = 'h-9 w-20 text-right tabular-nums md:text-[13px]';
const num = (value: string, min = 1) => Math.max(min, Number.parseInt(value, 10) || min);

const WeekdayButtons = ({
  mask,
  onChange,
  label,
}: {
  mask: number;
  onChange: (mask: number) => void;
  label: string;
}) => {
  const x = useTimeTexts();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {WEEKDAYS.map((bit, i) => (
        <button
          key={bit}
          type="button"
          aria-pressed={(mask & bit) !== 0}
          onClick={() => onChange(mask ^ bit)}
          className={cn(
            'h-9 w-11 rounded-lg border text-xs font-medium',
            (mask & bit) !== 0 ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {x.weekday(i, 'short')}
        </button>
      ))}
    </div>
  );
};

export const TimeModuleDialog = ({
  time,
  onSave,
  onCancel,
}: {
  time: TimeModule;
  onSave: (t: TimeModule) => void;
  onCancel: () => void;
}) => {
  const x = useTimeTexts();
  const [t, setT] = useState<TimeModule>({ ...time, begin: dateOf(time.begin) || today() });
  const set = (patch: Partial<TimeModule>) => setT((prev) => ({ ...prev, ...patch }));
  const mode = timeModeOf(t);
  const start = clockOf(t.time);
  const end = clockOfSeconds(secondsOfClock(start) + t.duration);

  const setMode = (next: TimeMode) => {
    const clock = mode === 'point' || mode === 'range' ? start : '07:00';
    if (next === 'point') set({ time: timeOfClock(clock), duration: 0, sunOffset: SUN.NONE });
    if (next === 'range') set({ time: timeOfClock(clock), duration: t.duration || 3600, sunOffset: SUN.NONE });
    if (next === 'allDay') set({ time: '0', duration: 0, sunOffset: SUN.NONE });
    if (next === 'daytime') set({ time: '0', duration: 0, sunOffset: SUN.DAYTIME });
    if (next === 'nighttime') set({ time: '0', duration: 0, sunOffset: SUN.NIGHTTIME });
  };
  const setType = (timerType: number) => {
    const now = new Date();
    const defaults: Partial<TimeModule> = { timerType, weekdays: 0, period: 0, repetitionValue: 0 };
    if (timerType === TIMER.ONCE) defaults.repeatTime = today(now);
    if (timerType === TIMER.PERIODIC) defaults.period = 3600;
    if (timerType === TIMER.WEEKLY) defaults.weekdays = WORKDAY_BITS;
    if (timerType === TIMER.MONTHLY) Object.assign(defaults, { period: now.getDate(), repetitionValue: 1 });
    if (timerType === TIMER.YEARLY)
      Object.assign(defaults, { period: now.getDate(), repetitionValue: now.getMonth() + 1 });
    set(defaults);
  };
  const dailyMode =
    t.weekdays === WORKDAY_BITS
      ? 'workdays'
      : t.weekdays === WEEKEND_BITS
        ? 'weekend'
        : t.repetitionValue > 1
          ? 'n'
          : 'every';
  const periodUnit = t.period % 3600 === 0 ? 3600 : t.period % 60 === 0 ? 60 : 1;
  const endMode = t.repetitionCount > 0 ? 'after' : dateOf(t.end) ? 'on' : 'none';

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent aria-label={m.PRG_TM_EDIT()} className="max-h-[calc(100vh-32px)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{m.PRG_TM_EDIT()}</DialogTitle>
          <DialogDescription>{describeTimeModule(t, x)}</DialogDescription>
        </DialogHeader>

        <Section title={m.PRG_TM_TIME()}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Choice name="mode" checked={mode === 'point'} onChange={() => setMode('point')} label={m.PRG_TM_POINT()} />
            {mode === 'point' && (
              <Input
                type="time"
                aria-label={m.PRG_TM_POINT()}
                className="h-9 w-28 md:text-[13px]"
                value={start}
                onChange={(e) => e.target.value && set({ time: timeOfClock(e.target.value) })}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Choice name="mode" checked={mode === 'range'} onChange={() => setMode('range')} label={m.PRG_TM_RANGE()} />
            {mode === 'range' && (
              <span className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={m.RANGE_FROM()}
                  className="h-9 w-28 md:text-[13px]"
                  value={start}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const length = (secondsOfClock(end) - secondsOfClock(e.target.value) + 86400) % 86400;
                    set({ time: timeOfClock(e.target.value), duration: length || 60 });
                  }}
                />
                –
                <Input
                  type="time"
                  aria-label={m.RANGE_TO()}
                  className="h-9 w-28 md:text-[13px]"
                  value={end}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    // Past midnight if the end is earlier
                    const length = (secondsOfClock(e.target.value) - secondsOfClock(start) + 86400) % 86400;
                    set({ duration: length || 60 });
                  }}
                />
              </span>
            )}
          </div>
          <Choice
            name="mode"
            checked={mode === 'allDay'}
            onChange={() => setMode('allDay')}
            label={m.PRG_TM_ALL_DAY()}
          />
          <Choice
            name="mode"
            checked={mode === 'daytime'}
            onChange={() => setMode('daytime')}
            label={m.PRG_TM_DAYTIME()}
          />
          <Choice
            name="mode"
            checked={mode === 'nighttime'}
            onChange={() => setMode('nighttime')}
            label={m.PRG_TM_NIGHTTIME()}
          />
          {(mode === 'daytime' || mode === 'nighttime') && (
            <p className="text-xs text-muted-foreground">{m.PRG_TM_ASTRO_HINT()}</p>
          )}
        </Section>

        <Section title={m.PRG_TM_PATTERN()}>
          <NativeSelect
            aria-label={m.PRG_TM_PATTERN()}
            className="h-9 w-48 md:text-[13px]"
            value={t.timerType}
            onChange={(e) => setType(Number(e.target.value))}
          >
            <option value={TIMER.ONCE}>{m.PRG_TM_ONCE()}</option>
            <option value={TIMER.PERIODIC}>{m.PRG_TM_PERIODIC()}</option>
            <option value={TIMER.DAILY}>{m.PRG_TM_DAILY()}</option>
            <option value={TIMER.WEEKLY}>{m.PRG_TM_WEEKLY()}</option>
            <option value={TIMER.MONTHLY}>{m.PRG_TM_MONTHLY()}</option>
            <option value={TIMER.YEARLY}>{m.PRG_TM_YEARLY()}</option>
          </NativeSelect>

          {t.timerType === TIMER.ONCE && (
            <Labeled label={m.PRG_TM_DATE()}>
              <Input
                type="date"
                aria-label={m.PRG_TM_DATE()}
                className="h-9 w-40 md:text-[13px]"
                value={dateOf(t.repeatTime)}
                onChange={(e) => e.target.value && set({ repeatTime: e.target.value })}
              />
            </Labeled>
          )}

          {t.timerType === TIMER.PERIODIC && (
            <Labeled label={m.PRG_TM_INTERVAL()}>
              <Input
                aria-label={m.PRG_TM_INTERVAL()}
                inputMode="numeric"
                className={numberClass}
                value={t.period / periodUnit}
                onChange={(e) => set({ period: num(e.target.value) * periodUnit })}
              />
              <NativeSelect
                aria-label={`${m.PRG_TM_INTERVAL()} (${m.TIME_UNIT()})`}
                className="h-9 w-32 md:text-[13px]"
                value={periodUnit}
                onChange={(e) => set({ period: (t.period / periodUnit) * Number(e.target.value) })}
              >
                <option value={3600}>{m.PRG_HOURS()}</option>
                <option value={60}>{m.PRG_MINUTES()}</option>
                <option value={1}>{m.PRG_SECONDS()}</option>
              </NativeSelect>
            </Labeled>
          )}

          {t.timerType === TIMER.DAILY && (
            <div className="flex flex-col gap-2">
              <Choice
                name="daily"
                checked={dailyMode === 'every'}
                onChange={() => set({ weekdays: 0, repetitionValue: 0 })}
                label={m.PRG_TM_EVERY_DAY()}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Choice
                  name="daily"
                  checked={dailyMode === 'n'}
                  onChange={() => set({ weekdays: 0, repetitionValue: 2 })}
                  label={m.PRG_TM_EVERY_N_DAYS()}
                />
                {dailyMode === 'n' && (
                  <Input
                    aria-label={m.PRG_TM_EVERY_N_DAYS()}
                    inputMode="numeric"
                    className={numberClass}
                    value={t.repetitionValue}
                    onChange={(e) => set({ repetitionValue: num(e.target.value, 2) })}
                  />
                )}
              </div>
              <Choice
                name="daily"
                checked={dailyMode === 'workdays'}
                onChange={() => set({ weekdays: WORKDAY_BITS, repetitionValue: 0 })}
                label={m.PRG_TM_WORKDAYS()}
              />
              <Choice
                name="daily"
                checked={dailyMode === 'weekend'}
                onChange={() => set({ weekdays: WEEKEND_BITS, repetitionValue: 0 })}
                label={m.PRG_TM_WEEKEND()}
              />
            </div>
          )}

          {t.timerType === TIMER.WEEKLY && (
            <div className="flex flex-col gap-2">
              <WeekdayButtons mask={t.weekdays} label={m.PRG_TM_WEEKLY()} onChange={(weekdays) => set({ weekdays })} />
              <Labeled label={m.PRG_TM_EVERY_N_WEEKS()}>
                <Input
                  aria-label={m.PRG_TM_EVERY_N_WEEKS()}
                  inputMode="numeric"
                  className={numberClass}
                  value={Math.max(1, t.repetitionValue)}
                  onChange={(e) => set({ repetitionValue: num(e.target.value) })}
                />
              </Labeled>
            </div>
          )}

          {(t.timerType === TIMER.MONTHLY || t.timerType === TIMER.YEARLY) && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Choice
                  name="monthly"
                  checked={t.weekdays === 0}
                  onChange={() => set({ weekdays: 0, period: Math.min(31, Math.max(1, t.period)) })}
                  label={m.PRG_TM_ON_DAY()}
                />
                {t.weekdays === 0 && (
                  <Input
                    aria-label={m.PRG_TM_DAY_OF_MONTH()}
                    inputMode="numeric"
                    className={numberClass}
                    value={t.period}
                    onChange={(e) => set({ period: Math.min(31, num(e.target.value)) })}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Choice
                  name="monthly"
                  checked={t.weekdays > 0}
                  onChange={() => set({ weekdays: 1, period: 1 })}
                  label={m.PRG_TM_ON_NTH()}
                />
                {t.weekdays > 0 && (
                  <>
                    <NativeSelect
                      aria-label={m.PRG_TM_NTH()}
                      className="h-9 w-20 md:text-[13px]"
                      value={t.period}
                      onChange={(e) => set({ period: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}.
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect
                      aria-label={m.PRG_TM_WEEKDAY()}
                      className="h-9 w-36 md:text-[13px]"
                      value={t.weekdays}
                      onChange={(e) => set({ weekdays: Number(e.target.value) })}
                    >
                      {WEEKDAYS.map((bit, i) => (
                        <option key={bit} value={bit}>
                          {x.weekday(i, 'long')}
                        </option>
                      ))}
                    </NativeSelect>
                  </>
                )}
              </div>
              {t.timerType === TIMER.MONTHLY ? (
                <Labeled label={m.PRG_TM_EVERY_N_MONTHS()}>
                  <Input
                    aria-label={m.PRG_TM_EVERY_N_MONTHS()}
                    inputMode="numeric"
                    className={numberClass}
                    value={Math.max(1, t.repetitionValue)}
                    onChange={(e) => set({ repetitionValue: num(e.target.value) })}
                  />
                </Labeled>
              ) : (
                <Labeled label={m.PRG_TM_MONTH()}>
                  <NativeSelect
                    aria-label={m.PRG_TM_MONTH()}
                    className="h-9 w-40 md:text-[13px]"
                    value={Math.max(1, t.repetitionValue)}
                    onChange={(e) => set({ repetitionValue: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {x.month(i)}
                      </option>
                    ))}
                  </NativeSelect>
                </Labeled>
              )}
            </div>
          )}
        </Section>

        {t.timerType !== TIMER.ONCE && (
          <Section title={m.PRG_TM_VALIDITY()}>
            <Labeled label={m.PRG_TM_BEGIN()}>
              <Input
                type="date"
                aria-label={m.PRG_TM_BEGIN()}
                className="h-9 w-40 md:text-[13px]"
                value={dateOf(t.begin)}
                onChange={(e) => e.target.value && set({ begin: e.target.value })}
              />
            </Labeled>
            <Choice
              name="end"
              checked={endMode === 'none'}
              onChange={() => set({ end: '0', repetitionCount: 0 })}
              label={m.PRG_TM_NO_END()}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Choice
                name="end"
                checked={endMode === 'after'}
                onChange={() => set({ end: '0', repetitionCount: 10 })}
                label={m.PRG_TM_END_AFTER()}
              />
              {endMode === 'after' && (
                <Input
                  aria-label={m.PRG_TM_END_AFTER()}
                  inputMode="numeric"
                  className={numberClass}
                  value={t.repetitionCount}
                  onChange={(e) => set({ repetitionCount: num(e.target.value) })}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Choice
                name="end"
                checked={endMode === 'on'}
                onChange={() => set({ end: dateOf(t.begin) || today(), repetitionCount: 0 })}
                label={m.PRG_TM_END_ON()}
              />
              {endMode === 'on' && (
                <Input
                  type="date"
                  aria-label={m.PRG_TM_END_ON()}
                  className="h-9 w-40 md:text-[13px]"
                  value={dateOf(t.end)}
                  onChange={(e) => e.target.value && set({ end: e.target.value })}
                />
              )}
            </div>
          </Section>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {m.CANCEL()}
          </Button>
          <Button
            type="button"
            onClick={() =>
              onSave({
                ...t,
                changed: true,
                begin: dateOf(t.begin),
                end: dateOf(t.end) || '0',
                repeatTime: t.timerType === TIMER.ONCE ? dateOf(t.repeatTime) : '',
                // A weekly module needs a day
                weekdays: t.timerType === TIMER.WEEKLY && t.weekdays === 0 ? WORKDAY_BITS : t.weekdays,
              })
            }
          >
            {m.PRG_APPLY()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
