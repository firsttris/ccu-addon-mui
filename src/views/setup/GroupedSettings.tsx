import { useMemo } from 'react';
import CalendarDaysIcon from '~icons/lucide/calendar-days';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import type { DatapointValue, ParamsetDescription } from '../../types/types';
import { shownParameters } from '../../controls/generic/ParamsetView';
import { SettingsView } from '../../controls/generic/SettingsView';
import { GROUP_ORDER, type ParameterGroup, parameterGroup } from '../../controls/generic/parameters';
import { Button } from '../../components/ui/button';
import { m } from '../../paraglide/messages';

const groupTitles: Record<Exclude<ParameterGroup, 'hidden'>, () => string> = {
  operation: m.GROUP_OPERATION,
  heating: m.GROUP_HEATING,
  switching: m.GROUP_SWITCHING,
  radio: m.GROUP_RADIO,
  other: m.GROUP_OTHER,
  schedule: m.GROUP_SCHEDULE,
  expert: m.GROUP_EXPERT,
};

// Rarely needed groups start folded
const folded = new Set<ParameterGroup>(['schedule', 'expert']);

interface GroupedSettingsProps {
  label: string;
  description: ParamsetDescription;
  values: Record<string, DatapointValue>;
  changed: Set<string>;
  readOnly: boolean;
  onSet: (name: string, value: string | number | boolean) => void;
  onEditWeekProfile?: () => void;
}

// A channel's settings in groups with readable names; the week schedule's
// many parameters are left to its editor
export const GroupedSettings = ({
  label,
  description,
  values,
  changed,
  readOnly,
  onSet,
  onEditWeekProfile,
}: GroupedSettingsProps) => {
  const groups = useMemo(() => {
    const byGroup = new Map<ParameterGroup, ParamsetDescription>();
    for (const [name, parameter] of shownParameters(description)) {
      const group = parameterGroup(name);
      byGroup.set(group, { ...(byGroup.get(group) ?? {}), [name]: parameter });
    }
    return byGroup;
  }, [description]);

  return (
    <div className="flex flex-col gap-4">
      {groups.has('hidden') && onEditWeekProfile && (
        <Button variant="outline" className="justify-start" onClick={onEditWeekProfile}>
          <CalendarDaysIcon />
          {m.EDIT_WEEK_PROFILE()}
        </Button>
      )}
      {GROUP_ORDER.map((group) => {
        const description = groups.get(group);
        if (!description) return null;
        const title = groupTitles[group as Exclude<ParameterGroup, 'hidden'>]();
        const view = (
          <SettingsView
            label={`${label} ${title}`}
            description={description}
            values={values}
            changed={changed}
            readOnly={readOnly}
            onSet={onSet}
          />
        );
        if (folded.has(group)) {
          const count = Object.keys(description).length;
          return (
            <details key={group} className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                <span className="flex-1">{title}</span>
                <span className="text-xs font-normal text-muted-foreground">{m.SETTINGS_COUNT({ count })}</span>
              </summary>
              <div className="border-t px-3 py-3">{view}</div>
            </details>
          );
        }
        return (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
            {view}
          </div>
        );
      })}
    </div>
  );
};
