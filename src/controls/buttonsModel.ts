// Names of the keys without what they all share (usually the device name)
export const keyLabels = (names: string[]): { title: string; labels: string[] } => {
  if (names.length < 2) return { title: names[0] ?? '', labels: names };
  let prefix = names[0];
  for (const name of names) {
    while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  // Only cut at a word boundary
  const cut = prefix.lastIndexOf(' ') + 1;
  const title = names[0].slice(0, cut).trim();
  return {
    title: title || names[0],
    labels: names.map((name) => name.slice(cut).trim() || name),
  };
};

// Title and key labels of a device's keys, in order of their addresses. While
// the names shown share a beginning, as keyLabels; else (e.g. one key given a
// name of its own) the title from the CCU's names, a renamed key its own name
// and the others their label from the CCU's names.
export const keyNames = (
  channels: { address: string; name: string; ccuName?: string }[],
): { title: string; labels: string[] } => {
  const keys = [...channels].sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }));
  const shown = keyLabels(keys.map((c) => c.name));
  if (keys.length < 2 || shown.title !== keys[0].name || keys.every((c) => c.ccuName === undefined)) return shown;
  const ccu = keyLabels(keys.map((c) => c.ccuName ?? c.name));
  return {
    title: ccu.title,
    labels: keys.map((c, i) => (c.ccuName === undefined ? ccu.labels[i] : c.name)),
  };
};
