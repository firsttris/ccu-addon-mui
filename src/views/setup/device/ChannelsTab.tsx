import ChevronRightIcon from '~icons/lucide/chevron-right';
import InfoIcon from '~icons/lucide/info';
import SendIcon from '~icons/lucide/send';
import { DeviceImage } from '../../../components/DeviceImage';
import { PanelSkeleton } from '../../../components/ui/skeleton';
import { humanize } from '../../../controls/generic/parameters';
import { type TranslationKey, useTranslations } from '../../../i18n/utils';
import { channelOf } from '../../../lib/address';
import { cn } from '../../../lib/utils';
import { m } from '../../../paraglide/messages';
import type { DatapointValue } from '../../../types/types';
import { ChannelMeta, NameField, useRename } from '../ChannelMeta';
import { GroupedSettings } from '../GroupedSettings';
import { Panel } from '../Panel';
import type { ChannelCard, Drafts, SettingsSection } from './deviceSettingsModel';

interface Editing {
  canEdit: boolean;
  drafts: Drafts;
  onSet: (section: SettingsSection, name: string, value: DatapointValue) => void;
  onEditWeekProfile: (address: string) => void;
}

// The settings of one address, changed as drafts until they are saved
const SettingsBlock = ({
  section,
  label,
  canEdit,
  drafts,
  onSet,
  onEditWeekProfile,
}: Editing & { section: SettingsSection; label: string }) => {
  const draft = drafts[section.address] ?? {};
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {m.DEVICE_SETTINGS_HEADING()}
        {canEdit && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
            <SendIcon className="size-3" />
            {m.DEVICE_SETTINGS_TRANSFER()}
          </span>
        )}
      </h3>
      <GroupedSettings
        label={`${label} ${section.address}`}
        description={section.description}
        values={{ ...section.current, ...draft }}
        changed={new Set(Object.keys(draft))}
        readOnly={!canEdit}
        onSet={(name, value) => onSet(section, name, value)}
        onEditWeekProfile={() => onEditWeekProfile(section.address)}
      />
    </div>
  );
};

// Pointing at a card marks its channel in the device's picture
const pointing = (setActiveChannel: (channel?: string) => void, channelAddress?: string) => ({
  onPointerEnter: () => setActiveChannel(channelAddress ? channelOf(channelAddress) : undefined),
  onPointerLeave: () => setActiveChannel(undefined),
  onFocus: () => setActiveChannel(channelAddress ? channelOf(channelAddress) : undefined),
});

const ChannelCardPanel = ({
  card,
  setActiveChannel,
  ...editing
}: Editing & { card: ChannelCard; setActiveChannel: (channel?: string) => void }) => {
  const t = useTranslations();
  const rename = useRename();
  const typeLabel = (type: string) => {
    const label = t(type as TranslationKey);
    return label === type ? humanize(type) : label;
  };
  return (
    <Panel
      id={`channel-${card.channel.index}`}
      aria-label={card.label}
      className="scroll-mt-24"
      {...pointing(setActiveChannel, card.channel.address)}
    >
      <header className="flex items-start gap-3">
        <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
          {card.channel.index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {editing.canEdit && card.rega ? (
            <NameField
              label={`${m.NAME()} ${card.channel.address}`}
              name={card.rega.name}
              onRename={(name) => rename(card.channel.address, name)}
            />
          ) : (
            <h2 className="truncate">{card.label}</h2>
          )}
          <span className="text-xs text-muted-foreground">
            {typeLabel(card.channel.type)} · <span className="font-mono">{card.channel.address}</span>
          </span>
        </div>
      </header>
      {card.rega && <ChannelMeta channel={card.rega} canEdit={editing.canEdit} />}
      {card.section && <SettingsBlock section={card.section} label={card.label} {...editing} />}
    </Panel>
  );
};

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// The device's picture and a list to jump to a channel's card
const JumpList = ({
  deviceType,
  cards,
  activeChannel,
  setActiveChannel,
}: {
  deviceType?: string;
  cards: ChannelCard[];
  activeChannel?: string;
  setActiveChannel: (channel?: string) => void;
}) => {
  const targets = [
    { id: 'device-card', index: '', label: m.DEVICE_SETTINGS() },
    ...cards.map((c) => ({ id: `channel-${c.channel.index}`, index: String(c.channel.index), label: c.label })),
  ];
  return (
    <aside className="flex flex-col gap-4 max-xl:hidden xl:sticky xl:top-[81px]">
      <DeviceImage type={deviceType} size={200} channel={activeChannel} />
      {targets.length > 2 && (
        <nav aria-label={m.DEVICE_JUMP()}>
          <ul className="flex flex-col gap-0.5">
            {targets.map((target) => (
              <li key={target.id}>
                <button
                  type="button"
                  onClick={() => jump(target.id)}
                  onPointerEnter={() => setActiveChannel(target.index || undefined)}
                  onPointerLeave={() => setActiveChannel(undefined)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground',
                    target.index !== '' && activeChannel === target.index && 'bg-accent text-foreground',
                  )}
                >
                  <span className="w-4 shrink-0 text-right font-mono text-[11px]">{target.index}</span>
                  <span className="truncate">{target.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
};

// The device card with the device-wide settings, a card per channel, the
// rarely needed channels folded away
export const ChannelsTab = ({
  address,
  title,
  deviceType,
  cards,
  deviceSections,
  loading,
  activeChannel,
  setActiveChannel,
  ...editing
}: Editing & {
  address: string;
  title: string;
  deviceType?: string;
  cards: ChannelCard[];
  deviceSections: SettingsSection[];
  loading: boolean;
  activeChannel?: string;
  setActiveChannel: (channel?: string) => void;
}) => {
  const rename = useRename();
  const shown = cards.filter((c) => !c.folded);
  const folded = cards.filter((c) => c.folded);
  const cardPanel = (card: ChannelCard) => (
    <ChannelCardPanel key={card.channel.address} card={card} setActiveChannel={setActiveChannel} {...editing} />
  );
  return (
    <div
      role="tabpanel"
      aria-label={m.DEVICE_TAB_CHANNELS()}
      className="grid items-start gap-5 xl:grid-cols-[200px_minmax(0,1fr)]"
    >
      <JumpList
        deviceType={deviceType}
        cards={shown}
        activeChannel={activeChannel}
        setActiveChannel={setActiveChannel}
      />
      <div className="flex min-w-0 flex-col gap-5">
        {editing.canEdit && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-px size-3.5 shrink-0" />
            {m.DEVICE_SAVE_HINT()}
          </p>
        )}
        <Panel
          id="device-card"
          aria-label={m.DEVICE_SETTINGS()}
          className="scroll-mt-24"
          {...pointing(setActiveChannel, undefined)}
        >
          <h2>{m.DEVICE_SETTINGS()}</h2>
          {editing.canEdit && (
            <NameField label={`${m.NAME()} ${address}`} name={title} onRename={(name) => rename(address, name)} />
          )}
          {deviceSections.map((s) => (
            <div key={s.address}>
              <SettingsBlock section={s} label={m.DEVICE_SETTINGS()} {...editing} />
            </div>
          ))}
        </Panel>
        {shown.map(cardPanel)}
        {loading && <PanelSkeleton lines={6} className="rounded-xl border bg-card p-5" />}
        {folded.length > 0 && (
          <details className="group rounded-xl border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
              {m.DEVICE_MORE_CHANNELS({ count: folded.length })}
            </summary>
            <div className="flex flex-col gap-5 border-t p-4">{folded.map(cardPanel)}</div>
          </details>
        )}
      </div>
    </div>
  );
};
