import type { NotificationRule, RuleCondition } from '../../types/protocol';
import { m } from '../../paraglide/messages';

// Notification rules as the editor handles them (go-server/pkg/rules)

export type Op = RuleCondition['op'];

export const MAX_CONDITIONS = 5;

export const emptyCondition = (): RuleCondition => ({
  channelId: 0,
  interfaceName: '',
  address: '',
  datapoint: '',
  op: 'eq',
  value: 1,
});

export const emptyRule = (): NotificationRule => ({
  id: '',
  name: '',
  enabled: true,
  conditions: [emptyCondition()],
  minutes: 0,
  message: '',
});

// Starting points for the usual cases; the channel is chosen afterwards
export interface Preset {
  key: string;
  label: () => string;
  rule: Pick<NotificationRule, 'minutes' | 'from' | 'to'> & {
    condition: Pick<RuleCondition, 'datapoint' | 'op' | 'value'>;
  };
}

export const presets: Preset[] = [
  // Window contacts (HmIP-SWDO STATE 0 = closed, BidCos STATE false)
  {
    key: 'window',
    label: m.RULE_PRESET_WINDOW,
    rule: { minutes: 15, condition: { datapoint: 'STATE', op: 'ne', value: 0 } },
  },
  // HmIP-SWD (DetectorControls)
  {
    key: 'water',
    label: m.RULE_PRESET_WATER,
    rule: { minutes: 0, condition: { datapoint: 'WATERLEVEL_DETECTED', op: 'eq', value: 1 } },
  },
  {
    key: 'door',
    label: m.RULE_PRESET_DOOR,
    rule: { minutes: 0, from: '22:00', to: '06:00', condition: { datapoint: 'STATE', op: 'ne', value: 0 } },
  },
];

export const fromPreset = (preset: Preset): NotificationRule => {
  const { condition, ...rest } = preset.rule;
  return { ...emptyRule(), ...rest, name: preset.label(), conditions: [{ ...emptyCondition(), ...condition }] };
};

export const isComplete = (c: RuleCondition) => c.address !== '' && c.datapoint !== '' && Number.isFinite(c.value);

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

// What the server accepts (rules.Validate)
export const isValid = (rule: NotificationRule) =>
  rule.name.trim() !== '' &&
  rule.conditions.length > 0 &&
  rule.conditions.every(isComplete) &&
  rule.minutes >= 0 &&
  (rule.from ? !!rule.to && clock.test(rule.from) && clock.test(rule.to) && rule.from !== rule.to : !rule.to);

export const opLabel = (op: Op, discrete: boolean) =>
  ({
    eq: discrete ? m.RULE_OP_IS : m.CMP_EQUAL,
    ne: discrete ? m.RULE_OP_IS_NOT : m.RULE_OP_NOT_EQUAL,
    lt: m.CMP_LESS,
    gt: m.CMP_GREATER,
  })[op]();

// "15 minutes", "2 hours", "1 h 30 min"
export const durationText = (minutes: number) => {
  if (minutes < 60) return m.RULE_MINUTES({ count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? m.RULE_HOURS({ count: hours }) : m.RULE_HOURS_MINUTES({ hours, minutes: rest });
};

// The conditions in words, with duration and time window: the summary the
// notification shows when the rule has no own text
export const summaryOf = (rule: Pick<NotificationRule, 'minutes' | 'from' | 'to'>, conditions: string[]) => {
  const parts = [conditions.filter(Boolean).join(m.RULE_AND())];
  if (rule.minutes > 0) parts.push(m.RULE_FOR({ duration: durationText(rule.minutes) }));
  if (rule.from && rule.to) parts.push(m.RULE_BETWEEN({ from: rule.from, to: rule.to }));
  return parts.filter(Boolean).join(' · ');
};
