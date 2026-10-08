import { useEffect, useMemo, useRef, useState } from 'react';
import MinusIcon from '~icons/lucide/minus';
import PlusIcon from '~icons/lucide/plus';
import ScissorsIcon from '~icons/lucide/scissors';
import TrashIcon from '~icons/lucide/trash-2';
import CopyIcon from '~icons/lucide/copy';
import { useParamset, useParamsetDescription, usePutParamset, useSetDataPoint } from '../../../queries';
import { RequestError, useWebSocketContext } from '../../../hooks/useWebsocket';
import { useToast } from '../../../contexts/ToastContext';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { Button } from '../../../components/ui/button';
import { NativeSelect } from '../../../components/ui/select';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ElevateDialog } from '../../../components/ElevateDialog';
import { getTemperatureColor } from '../../../utils/colors';
import { getLocale } from '../../../paraglide/runtime';
import { m } from '../../../paraglide/messages';
import { cn, formatNumber } from '../../../lib/utils';
import {
  changedValues,
  DAY_END,
  DAYS,
  Day,
  DayProfile,
  formatMinutes,
  profileLayout,
  readWeek,
  removeSlot,
  setSlotEnd,
  setSlotTemperature,
  SLOT_STEP,
  splitSlot,
  WeekProfile,
} from './weekProfile';

interface WeekProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interfaceName: string;
  address: string;
  name: string;
  activeProfile?: number;
}

const formatTemperature = (value: number) => formatNumber(value, 1, 1);

// Monday = 0 … Sunday = 6, like DAYS
const todayIndex = () => (new Date().getDay() + 6) % 7;
const nowMinutes = () => new Date().getHours() * 60 + new Date().getMinutes();

const dayName = (index: number, style: 'short' | 'long') =>
  // 2024-01-01 was a Monday
  new Intl.DateTimeFormat(getLocale(), { weekday: style }).format(new Date(2024, 0, 1 + index));

// One day as a bar from midnight to midnight, colored by temperature
const DayBar = ({ day, now, compact }: { day: DayProfile; now?: number; compact?: boolean }) => (
  <div className={cn('relative flex overflow-hidden rounded-md bg-muted', compact ? 'h-7' : 'h-10')}>
    {day.map((slot, i) => {
      const start = i === 0 ? 0 : day[i - 1].end;
      const width = ((slot.end - start) / DAY_END) * 100;
      return (
        <div
          key={i}
          className="flex items-center justify-center overflow-hidden border-r border-background/40 text-[11px] font-semibold text-white last:border-r-0"
          style={{ width: `${width}%`, background: getTemperatureColor(slot.temperature) }}
          title={`${formatMinutes(start)}–${formatMinutes(slot.end)} · ${formatTemperature(slot.temperature)} °C`}
        >
          {width > 9 && <span className="truncate px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">{formatTemperature(slot.temperature)}</span>}
        </div>
      );
    })}
    {now !== undefined && (
      <div
        aria-hidden
        className="absolute top-0 bottom-0 w-0.5 bg-foreground shadow-[0_0_0_1px_var(--background)]"
        style={{ left: `${(now / DAY_END) * 100}%` }}
      />
    )}
  </div>
);

const TimeAxis = () => (
  <div className="relative ml-10 h-4 text-[10px] text-muted-foreground tabular-nums">
    {[0, 6, 12, 18, 24].map((hour) => (
      <span key={hour} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(hour / 24) * 100}%` }}>
        {hour}
      </span>
    ))}
  </div>
);

// The slots of the selected day, each with its end time and temperature
const DayEditor = ({
  day,
  maxSlots,
  readOnly,
  onChange,
}: {
  day: DayProfile;
  maxSlots: number;
  readOnly: boolean;
  onChange: (day: DayProfile) => void;
}) => (
  <ol className="flex flex-col divide-y rounded-xl border">
    {day.map((slot, index) => {
      const start = index === 0 ? 0 : day[index - 1].end;
      const last = index === day.length - 1;
      return (
        <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ background: getTemperatureColor(slot.temperature) }}
          />
          <span className="flex items-center gap-1.5 text-sm tabular-nums">
            {formatMinutes(start)}
            <span className="text-muted-foreground">{m.SLOT_UNTIL()}</span>
            {last || readOnly ? (
              <span>{formatMinutes(slot.end)}</span>
            ) : (
              <NativeSelect
                aria-label={m.SLOT_END({ from: formatMinutes(start) })}
                value={slot.end}
                onChange={(event) => onChange(setSlotEnd(day, index, Number(event.target.value)))}
                className="h-8 w-[5.5rem] tabular-nums"
              >
                {Array.from(
                  { length: Math.max(0, (day[index + 1].end - start) / SLOT_STEP - 1) },
                  (_, i) => start + (i + 1) * SLOT_STEP,
                ).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatMinutes(minutes)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {!readOnly && (
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={`${m.COLDER()} ${formatMinutes(start)}`}
                onClick={() => onChange(setSlotTemperature(day, index, slot.temperature - 0.5))}
              >
                <MinusIcon />
              </Button>
            )}
            <span className="w-16 text-center text-sm font-semibold tabular-nums">{formatTemperature(slot.temperature)} °C</span>
            {!readOnly && (
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={`${m.WARMER()} ${formatMinutes(start)}`}
                onClick={() => onChange(setSlotTemperature(day, index, slot.temperature + 0.5))}
              >
                <PlusIcon />
              </Button>
            )}
          </span>
          {!readOnly && (
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`${m.SPLIT_SLOT()} ${formatMinutes(start)}`}
                title={m.SPLIT_SLOT()}
                disabled={day.length >= maxSlots}
                onClick={() => onChange(splitSlot(day, index, maxSlots))}
              >
                <ScissorsIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={`${m.REMOVE_SLOT()} ${formatMinutes(start)}`}
                title={m.REMOVE_SLOT()}
                disabled={day.length <= 1}
                onClick={() => onChange(removeSlot(day, index))}
              >
                <TrashIcon />
              </Button>
            </span>
          )}
        </li>
      );
    })}
  </ol>
);

// Viewing and editing the week schedule of a thermostat or heating group
export const WeekProfileSheet = ({ open, onOpenChange, interfaceName, address, name, activeProfile }: WeekProfileSheetProps) => {
  const { showToast } = useToast();
  const { userLevel, elevated } = useWebSocketContext();
  const canEdit = userLevel === 'admin' && elevated;
  const { data: description, isPending: loadingDescription } = useParamsetDescription(interfaceName, address, 'MASTER', { enabled: open });
  const { data: values } = useParamset(interfaceName, address, 'MASTER', { enabled: open });
  const putParamset = usePutParamset();
  const setDataPoint = useSetDataPoint();
  const { profiles, slots, prefixed } = useMemo(() => profileLayout(description), [description]);
  // BidCos wall thermostats choose the profile in their MASTER paramset
  // (WEEK_PROGRAM_POINTER 0-2), not with ACTIVE_PROFILE
  const pointer = description !== undefined && 'WEEK_PROGRAM_POINTER' in description;
  const runningProfile = pointer
    ? typeof values?.WEEK_PROGRAM_POINTER === 'number'
      ? values.WEEK_PROGRAM_POINTER + 1
      : undefined
    : activeProfile;

  const [profile, setProfile] = useState(activeProfile ?? 1);
  const [selectedDay, setSelectedDay] = useState(todayIndex());
  // Unsaved edits of the selected profile
  const [draft, setDraft] = useState<WeekProfile | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [elevating, setElevating] = useState(false);

  // Start over each time the sheet opens, not when the active profile
  // changes meanwhile (an event, or "use this profile"): that would throw
  // away the edits
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setProfile(activeProfile ?? 1);
      setDraft(null);
      setSelectedDay(todayIndex());
    }
    wasOpen.current = open;
  }, [open, activeProfile]);
  // A profile the device doesn't have (known once its description is in)
  useEffect(() => {
    if (profiles > 0 && profile > profiles) setProfile(1);
  }, [profile, profiles]);

  // The names of the HM-CC-RT-DN's one profile have no "P1_" (profile 0)
  const key = prefixed ? profile : 0;
  const stored = useMemo(() => (values && profiles > 0 ? readWeek(values, key, slots) : null), [values, key, slots, profiles]);
  const week = draft ?? stored;
  const changes = useMemo(
    () => (week && values ? changedValues(values, key, week, slots) : {}),
    [week, values, key, slots],
  );
  const changeCount = Object.keys(changes).length;
  const day: Day = DAYS[selectedDay];

  const updateDay = (target: Day, dayProfile: DayProfile) => week && setDraft({ ...week, [target]: dayProfile });
  const copyTo = (targets: Day[]) => {
    if (!week) return;
    const next = { ...week };
    for (const target of targets) next[target] = week[day].map((slot) => ({ ...slot }));
    setDraft(next);
    showToast(m.COPIED(), 'info');
  };

  const save = () =>
    putParamset.mutate(
      { interfaceName, address, values: changes },
      {
        onSuccess: () => {
          setDraft(null);
          showToast(m.SAVED(), 'info');
        },
        onError: (error) => {
          if (error instanceof RequestError && error.code === 'ELEVATION_REQUIRED') {
            setElevating(true);
          } else {
            showToast(`${m.SAVE_FAILED()}: ${error.message}`);
          }
        },
        onSettled: () => setConfirming(false),
      },
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg">{m.WEEK_PROFILE()}</SheetTitle>
          <SheetDescription>
            {name} · {m.WEEK_PROFILE_HINT()}
          </SheetDescription>
        </SheetHeader>

        {!loadingDescription && profiles === 0 && <p className="px-4 text-sm text-muted-foreground">{m.NO_WEEK_PROFILE()}</p>}

        {profiles > 0 && (
          <div className="flex flex-col gap-5 px-4 pb-28">
            {userLevel === 'admin' && !elevated && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                <span className="flex-1">{m.ELEVATE_HINT()}</span>
                <Button variant="outline" size="sm" onClick={() => setElevating(true)}>
                  {m.ELEVATE()}
                </Button>
              </div>
            )}
            {userLevel !== 'admin' && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                {m.ADMIN_ONLY()}
              </p>
            )}

            {profiles > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label={m.WEEK_PROFILE()} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                  {Array.from({ length: profiles }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      role="tab"
                      aria-selected={profile === n}
                      disabled={changeCount > 0 && profile !== n}
                      onClick={() => {
                        setProfile(n);
                        setDraft(null);
                      }}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-40',
                        profile === n ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m.PROFILE_N({ n })}
                      {runningProfile === n && <span className="size-1.5 rounded-full bg-green-500" aria-label={m.ACTIVE_PROFILE()} />}
                    </button>
                  ))}
                </div>
                {runningProfile !== undefined && runningProfile !== profile && (pointer ? canEdit : userLevel !== 'guest') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (pointer) {
                        // A setting of the device: through putParamset, like the WebUI's
                        // device parameters (tc_it_dev_master.tcl)
                        putParamset.mutate(
                          { interfaceName, address, values: { WEEK_PROGRAM_POINTER: profile - 1 } },
                          {
                            onSuccess: () => showToast(m.PROFILE_ACTIVATED(), 'info'),
                            onError: (error) => showToast(`${m.SAVE_FAILED()}: ${error.message}`),
                          },
                        );
                        return;
                      }
                      setDataPoint(interfaceName, address, 'ACTIVE_PROFILE', profile);
                      showToast(m.PROFILE_ACTIVATED(), 'info');
                    }}
                  >
                    {m.USE_PROFILE()}
                  </Button>
                )}
              </div>
            )}

            {week && (
              <>
                <section aria-label={m.WEEK_PROFILE()} className="flex flex-col gap-1.5">
                  {DAYS.map((d, index) => (
                    <button
                      key={d}
                      aria-pressed={index === selectedDay}
                      aria-label={dayName(index, 'long')}
                      onClick={() => setSelectedDay(index)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-accent',
                        index === selectedDay && 'bg-accent ring-1 ring-ring/40',
                      )}
                    >
                      <span className={cn('w-8 shrink-0 text-sm', index === todayIndex() ? 'font-semibold' : 'text-muted-foreground')}>
                        {dayName(index, 'short')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <DayBar day={week[d]} compact now={index === todayIndex() ? nowMinutes() : undefined} />
                      </div>
                    </button>
                  ))}
                  <TimeAxis />
                </section>

                <section aria-label={dayName(selectedDay, 'long')} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">
                      {dayName(selectedDay, 'long')}
                      {selectedDay === todayIndex() && <span className="ml-2 text-sm font-normal text-muted-foreground">{m.TODAY()}</span>}
                    </h3>
                    {canEdit && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => copyTo(DAYS.slice(0, 5).filter((d) => d !== day))}>
                          <CopyIcon />
                          {m.COPY_TO_WEEKDAYS()}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => copyTo(DAYS.slice(5).filter((d) => d !== day))}>
                          {m.COPY_TO_WEEKEND()}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => copyTo(DAYS.filter((d) => d !== day))}>
                          {m.COPY_TO_ALL()}
                        </Button>
                      </div>
                    )}
                  </div>
                  <DayBar day={week[day]} now={selectedDay === todayIndex() ? nowMinutes() : undefined} />
                  <DayEditor day={week[day]} maxSlots={slots} readOnly={!canEdit} onChange={(next) => updateDay(day, next)} />
                </section>
              </>
            )}
          </div>
        )}

        {canEdit && changeCount > 0 && (
          <div className="fixed inset-x-0 bottom-0 flex items-center justify-end gap-2 border-t bg-background/90 p-4 backdrop-blur-md sm:absolute">
            <span className="mr-auto text-sm text-muted-foreground">
              {changeCount === 1 ? m.CHANGES_ONE() : m.CHANGES_COUNT({ count: changeCount })}
            </span>
            <Button variant="outline" onClick={() => setDraft(null)}>
              {m.RESET()}
            </Button>
            <Button onClick={() => setConfirming(true)}>{m.SAVE()}</Button>
          </div>
        )}

        {confirming && (
          <ConfirmDialog
            title={m.SAVE_CHANGES()}
            confirmLabel={m.SAVE()}
            busy={putParamset.isPending}
            onConfirm={save}
            onCancel={() => setConfirming(false)}
          >
            <p>
              {m.PROFILE_N({ n: profile })} · {changeCount === 1 ? m.CHANGES_ONE() : m.CHANGES_COUNT({ count: changeCount })}
            </p>
            <p className="mt-2 text-muted-foreground">{m.PROFILE_SAVE_HINT()}</p>
          </ConfirmDialog>
        )}
        {elevating && <ElevateDialog onDone={() => setElevating(false)} onCancel={() => setElevating(false)} />}
      </SheetContent>
    </Sheet>
  );
};
