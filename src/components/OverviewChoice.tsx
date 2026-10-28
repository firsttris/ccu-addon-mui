import { useShowOverview } from '../hooks/useShowOverview';
import { m } from '../paraglide/messages';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

// Shows or hides the overview above the tiles, on this device
export const OverviewChoice = () => {
  const [show, setShow] = useShowOverview();
  return (
    <div className="flex flex-col px-3 pb-1">
      <div className="flex h-11 items-center justify-between">
        <Label htmlFor="show-overview" className="text-[15px] font-normal">
          {m.SHOW_OVERVIEW()}
        </Label>
        <Switch id="show-overview" checked={show} onCheckedChange={setShow} />
      </div>
      <span className="text-xs text-muted-foreground">{m.SHOW_OVERVIEW_HINT()}</span>
    </div>
  );
};
