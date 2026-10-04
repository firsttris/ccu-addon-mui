// Searching channels by what people remember of them: words of the name,
// the device, its type, the room or the address, in any order. A word
// matches when it is contained, or loosely, when its letters appear in
// order (so "wzlicht" finds "Wohnzimmer Licht").

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

// The letters of needle in order within a short stretch of haystack: at
// about twice as long as the needle, so they belong together
const inOrder = (needle: string, haystack: string) => {
  for (let start = haystack.indexOf(needle[0]); start >= 0; start = haystack.indexOf(needle[0], start + 1)) {
    let i = 0;
    for (let j = start; j < haystack.length && j - start < needle.length * 2 + 4; j++) {
      if (haystack[j] === needle[i]) i++;
      if (i === needle.length) return true;
    }
  }
  return false;
};

// Higher is better; 0 means no match
export const matchScore = (query: string, fields: string[]) => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const normalized = fields.map(normalize);
  const text = normalized.join(' ');
  const compact = normalized.map((f) => f.replace(/[^a-z0-9]/g, ''));
  let score = 0;
  for (const word of words) {
    const letters = word.replace(/[^a-z0-9]/g, '');
    if (text.includes(word)) score += 3;
    else if (letters.length >= 3 && compact.some((f) => inOrder(letters, f))) score += 1;
    else return 0;
  }
  return score;
};
