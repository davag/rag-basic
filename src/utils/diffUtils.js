import { diffLines, diffWords } from 'diff';

// Returns a list of diff parts with context lines around changes
export function getLineDiff(oldStr, newStr, context = 2) {
  const diff = diffLines(oldStr, newStr);
  let result = [];
  let buffer = [];
  let lastChangeIdx = -context - 1;
  let idx = 0;
  let lineIdx = 0;

  // Flatten diff into lines with meta
  const lines = [];
  diff.forEach(part => {
    const partLines = part.value.split(/\n/);
    partLines.forEach((line, i) => {
      if (i === partLines.length - 1 && line === "") return; // skip trailing empty
      lines.push({
        ...part,
        value: line,
        added: part.added || false,
        removed: part.removed || false,
        context: !part.added && !part.removed,
        idx: lineIdx++
      });
    });
  });

  // Mark context lines
  let changedIdxs = lines
    .map((l, i) => (l.added || l.removed ? i : -1))
    .filter(i => i !== -1);
  let contextSet = new Set();
  changedIdxs.forEach(i => {
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
      contextSet.add(j);
    }
  });

  // Only include lines that are changed or in context
  result = lines.filter((l, i) => contextSet.has(i));

  return result;
}

// Returns a list of word diff parts for a single line
export function getWordDiff(oldLine, newLine) {
  return diffWords(oldLine, newLine);
} 