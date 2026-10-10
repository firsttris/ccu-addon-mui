import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Button } from '../../components/ui/button';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { Panel } from '../setup/Panel';
import { m } from '../../paraglide/messages';
import type { Diagram, EnergyPrice } from '../../types/protocol';
import { DiagramCard } from './DiagramCard';
import { DiagramEditor, useCandidates } from './DiagramEditor';
import { keyOf } from './diagramModel';
import { useLiveUpdates } from './useDiagramData';

// The diagrams: open to everyone logged in, as the WebUI's Status und
// Bedienung → Diagramme (DiagramControlListPage); administrators create
// and change them
export const Diagrams = () => {
  usePageTitle(m.DIAGRAMS());
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const canEdit = userLevel === 'admin' && elevated;
  const [creating, setCreating] = useState(false);
  const candidates = useCandidates();
  const names = useMemo(() => new Map(candidates.map((c) => [keyOf(c.series), c.name])), [candidates]);

  const diagrams = useQuery({
    queryKey: ['diagrams'],
    queryFn: () => request({ type: 'getDiagrams' }),
  });
  useLiveUpdates(diagrams.data?.diagrams);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{m.DIAGRAMS()}</h1>
        {canEdit && (
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            {m.DIAG_NEW()}
          </Button>
        )}
      </div>
      {diagrams.data?.diagrams === undefined ? (
        <Panel aria-busy>
          <PanelSkeleton lines={6} />
        </Panel>
      ) : diagrams.data.diagrams.length === 0 ? (
        <Panel>
          <p>{m.DIAG_NONE()}</p>
          {canEdit && <p>{m.DIAG_NONE_ADMIN()}</p>}
        </Panel>
      ) : (
        diagrams.data.diagrams.map((diagram) => (
          <DiagramCard
            key={diagram.id}
            diagram={diagram}
            canEdit={canEdit}
            names={names}
            energyPrice={diagrams.data?.energyPrice}
          />
        ))
      )}
      <p className="text-xs text-muted-foreground">{m.DIAG_HINT()}</p>
      {creating && <DiagramEditor onClose={() => setCreating(false)} />}
    </>
  );
};

// The diagrams shown as tiles in a room, trade or favorite list
export const PlaceDiagrams = ({ place }: { place: number }) => {
  const { request } = useWebSocketActions();
  const diagrams = useQuery({
    queryKey: ['diagrams'],
    queryFn: () => request({ type: 'getDiagrams' }),
    // Without the recorder (an older server) there are none
    retry: false,
  });
  const shown = useMemo(
    () => (diagrams.data?.diagrams ?? []).filter((d) => d.places?.includes(place)),
    [diagrams.data, place],
  );
  useLiveUpdates(shown, false);
  return shown.length > 0 ? <PlaceDiagramTiles diagrams={shown} energyPrice={diagrams.data?.energyPrice} /> : null;
};

// Only rooms with diagrams load the names of all channels
const PlaceDiagramTiles = ({ diagrams: shown, energyPrice }: { diagrams: Diagram[]; energyPrice?: EnergyPrice }) => {
  const candidates = useCandidates();
  const names = useMemo(() => new Map(candidates.map((c) => [keyOf(c.series), c.name])), [candidates]);
  return (
    <section aria-label={m.DIAGRAMS()} className="grid gap-4 lg:grid-cols-2">
      {shown.map((diagram) => (
        <DiagramCard
          key={diagram.id}
          diagram={diagram}
          canEdit={false}
          names={names}
          energyPrice={energyPrice}
          compact
        />
      ))}
    </section>
  );
};
