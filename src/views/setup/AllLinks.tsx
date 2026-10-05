import { useMemo, useState } from 'react';
import SearchIcon from '~icons/lucide/search';
import { useAllLinks, useChannelList, useRooms } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { useChannelNames } from './channelNames';
import { AddLinkForm } from './Links';
import { LinkList } from './LinkList';
import { m } from '../../paraglide/messages';

// All direct links of the CCU, like the WebUI's "Programme & Verknüpfungen →
// Direkte Verknüpfungen" (config/ic_linkpeerlist.cgi), as "who controls
// whom": grouped by sender, search and room filter, parameters with the
// link profiles, remove, and linking a new pair.
export const AllLinks = () => {
  usePageTitle(m.LINKS());
  const { data: links = [], isLoading } = useAllLinks();
  const names = useChannelNames();
  const { data: channels = [] } = useChannelList();
  const { data: rooms = [] } = useRooms();
  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('');
  const [added, setAdded] = useState<string>();

  const label = (address: string) => `${names.get(address) ?? address} (${address})`;
  const needle = query.trim().toLocaleLowerCase();
  const channelRooms = useMemo(() => new Map(channels.map((c) => [c.address, c.rooms ?? []])), [channels]);
  const inRoom = (address: string) => room === '' || (channelRooms.get(address) ?? []).includes(Number(room));
  const shown = links.filter(
    (link) =>
      (inRoom(link.sender) || inRoom(link.receiver)) &&
      (needle === '' ||
        `${label(link.sender)} ${label(link.receiver)} ${link.name ?? ''}`.toLocaleLowerCase().includes(needle)),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-md flex-1 basis-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={m.SEARCH()} placeholder={m.SEARCH()} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <NativeSelect aria-label={m.ROOMS()} className="w-auto" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="">{m.LINKS_ALL_ROOMS()}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {!isLoading && shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{links.length === 0 ? m.NO_LINKS() : m.NO_RESULTS()}</p>
      ) : (
        <LinkList links={shown} isLoading={isLoading} added={added} />
      )}

      <section aria-label={m.ADD_LINK()} className="flex flex-col gap-3">
        <AddLinkForm
          onAdded={(key) => {
            // The filters must not hide the new link
            setQuery('');
            setRoom('');
            setAdded(key);
          }}
        />
      </section>

    </div>
  );
};
