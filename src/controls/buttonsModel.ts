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
