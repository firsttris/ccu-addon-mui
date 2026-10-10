import { useMemo, useState } from 'react';
import { useLinks } from '../../queries';
import type { DeviceChannel } from '../../types/types';
import { m } from '../../paraglide/messages';
import { LinkList } from './LinkList';
import { AddLinkForm } from './AddLinkForm';

export interface LinksProps {
  interfaceName: string;
  deviceAddress: string;
  channels: DeviceChannel[];
}

// Direct links of a device: what it controls and what controls it, add
// and remove
export const Links = ({ interfaceName, deviceAddress, channels }: LinksProps) => {
  const { data: links = [], isPending: linksLoading } = useLinks(interfaceName, deviceAddress);
  const withInterface = useMemo(() => links.map((link) => ({ ...link, interfaceName })), [links, interfaceName]);
  const [added, setAdded] = useState<string>();

  return (
    <>
      {!linksLoading && links.length === 0 ? (
        <p>{m.NO_LINKS()}</p>
      ) : (
        <LinkList links={withInterface} isLoading={linksLoading} device={deviceAddress} added={added} />
      )}
      <AddLinkForm interfaceName={interfaceName} deviceAddress={deviceAddress} channels={channels} onAdded={setAdded} />
    </>
  );
};
