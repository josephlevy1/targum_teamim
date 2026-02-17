import type { GeneratedTaam, TaamEvent, Token, TransposeConfig } from "./types.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function lastLetterIndex(token: Token): number {
  return Math.max(0, token.letters.length - 1);
}

export function extractTaamEvents(hebrewTokens: Token[]): TaamEvent[] {
  const events: TaamEvent[] = [];
  for (let t = 0; t < hebrewTokens.length; t += 1) {
    const token = hebrewTokens[t];
    for (let l = 0; l < token.letters.length; l += 1) {
      const letter = token.letters[l];
      for (const taam of letter.taamim) {
        events.push({
          taamId: taam.taamId,
          name: taam.name,
          unicodeMark: taam.unicodeMark,
          tier: taam.tier,
          hebAnchor: { tokenIndex: t, letterIndex: l },
        });
      }
    }
  }
  return events;
}

export interface Segment {
  start: number;
  end: number;
}

export function segmentHebrewByDisjunctives(events: TaamEvent[], config: TransposeConfig, hebTokenCount: number): Segment[] {
  if (hebTokenCount === 0) {
    return [];
  }

  const boundarySet = new Set(config.disjunctiveBoundaries);
  const segments: Segment[] = [];
  let currentStart = 0;
  for (const event of events) {
    if (boundarySet.has(event.name) || event.name === config.sofPasukName) {
      const boundary = clamp(event.hebAnchor.tokenIndex + 1, 1, hebTokenCount);
      segments.push({ start: currentStart, end: boundary });
      currentStart = boundary;
    }
  }

  if (currentStart < hebTokenCount) {
    segments.push({ start: currentStart, end: hebTokenCount });
  }

  if (segments.length === 0) {
    segments.push({ start: 0, end: hebTokenCount });
  }

  return segments;
}

export function allocateAramaicSegments(arTokenCount: number, heSegments: Segment[], hebTokenCount: number): Segment[] {
  if (arTokenCount === 0) {
    return [];
  }
  if (heSegments.length === 0 || hebTokenCount === 0) {
    return [{ start: 0, end: arTokenCount }];
  }

  const allocation = heSegments.map((seg) => {
    const heWords = Math.max(1, seg.end - seg.start);
    return Math.max(1, Math.round((heWords / hebTokenCount) * arTokenCount));
  });

  let total = allocation.reduce((a, b) => a + b, 0);
  while (total > arTokenCount) {
    const idx = allocation.findIndex((n) => n > 1);
    if (idx === -1) {
      break;
    }
    allocation[idx] -= 1;
    total -= 1;
  }
  while (total < arTokenCount) {
    allocation[allocation.length - 1] += 1;
    total += 1;
  }

  const arSegments: Segment[] = [];
  let cursor = 0;
  for (const count of allocation) {
    const start = clamp(cursor, 0, Math.max(0, arTokenCount - 1));
    const end = clamp(cursor + count, start + 1, arTokenCount);
    arSegments.push({ start, end });
    cursor = Math.min(arTokenCount, cursor + count);
  }
  if (arSegments.length > 0) {
    arSegments[arSegments.length - 1].end = arTokenCount;
  }
  return arSegments;
}

function scoreConfidence(
  hebSegSize: number,
  arSegSize: number,
  mappedToken: number,
  isLastHebToken: boolean,
  isLastArToken: boolean,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0.5;

  const delta = Math.abs(hebSegSize - arSegSize);
  if (delta === 0) {
    score += 0.2;
    reasons.push("segment-size-match");
  } else if (delta <= 1) {
    score += 0.1;
    reasons.push("segment-size-near");
  } else {
    score -= 0.1;
    reasons.push("segment-size-divergent");
  }

  if (isLastHebToken && isLastArToken) {
    score += 0.2;
    reasons.push("segment-terminal-aligned");
  }

  if (mappedToken === 0 && arSegSize > 4) {
    score -= 0.05;
    reasons.push("early-anchor");
  }

  return { score: clamp(score, 0, 1), reasons };
}

export function enforceConstraints(generated: GeneratedTaam[], aramaicTokens: Token[], config: TransposeConfig): GeneratedTaam[] {
  const out = [...generated];
  const finalTokenIdx = Math.max(0, aramaicTokens.length - 1);

  let prevToken = -1;
  for (const item of out) {
    if (item.name === config.sofPasukName) {
      item.position.tokenIndex = finalTokenIdx;
      item.position.letterIndex = lastLetterIndex(aramaicTokens[finalTokenIdx]);
      item.reasons.push("sof-pasuk-finalized");
      item.confidence = Math.max(item.confidence, 0.95);
      continue;
    }

    if (item.position.tokenIndex < prevToken) {
      item.position.tokenIndex = prevToken;
      item.position.letterIndex = lastLetterIndex(aramaicTokens[item.position.tokenIndex]);
      item.reasons.push("monotonic-adjustment");
      item.confidence = Math.max(0, item.confidence - 0.1);
    }
    prevToken = item.position.tokenIndex;
  }

  return out;
}

export function transposeTaamim(
  hebrewTokens: Token[],
  aramaicTokens: Token[],
  config: TransposeConfig,
): GeneratedTaam[] {
  const heEvents = extractTaamEvents(hebrewTokens);
  if (heEvents.length === 0 || aramaicTokens.length === 0) {
    return [];
  }

  const heSegments = segmentHebrewByDisjunctives(heEvents, config, hebrewTokens.length);
  const arSegments = allocateAramaicSegments(aramaicTokens.length, heSegments, hebrewTokens.length);
  const lastArToken = aramaicTokens.length - 1;

  const output: GeneratedTaam[] = [];

  for (let segIdx = 0; segIdx < heSegments.length; segIdx += 1) {
    const heSeg = heSegments[segIdx];
    const arSeg = arSegments[Math.min(segIdx, arSegments.length - 1)] ?? { start: 0, end: aramaicTokens.length };

    const segEvents = heEvents.filter(
      (event) => event.hebAnchor.tokenIndex >= heSeg.start && event.hebAnchor.tokenIndex < heSeg.end,
    );

    for (const event of segEvents) {
      if (event.name === config.sofPasukName) {
        const finalToken = aramaicTokens.length - 1;
        output.push({
          taamId: event.taamId,
          name: event.name,
          unicodeMark: event.unicodeMark,
          tier: event.tier,
          position: {
            tokenIndex: finalToken,
            letterIndex: lastLetterIndex(aramaicTokens[finalToken]),
          },
          confidence: 0.99,
          reasons: ["sof-pasuk-special-rule"],
        });
        continue;
      }

      const heSegWords = Math.max(1, heSeg.end - heSeg.start);
      const arSegWords = Math.max(1, arSeg.end - arSeg.start);
      const rel = (event.hebAnchor.tokenIndex - heSeg.start + 1) / heSegWords;
      const mappedOffset = clamp(Math.round(rel * arSegWords) - 1, 0, arSegWords - 1);
      const mappedToken = clamp(arSeg.start + mappedOffset, 0, lastArToken);

      const conf = scoreConfidence(
        heSegWords,
        arSegWords,
        mappedOffset,
        event.hebAnchor.tokenIndex === heSeg.end - 1,
        mappedToken === arSeg.end - 1,
      );

      output.push({
        taamId: event.taamId,
        name: event.name,
        unicodeMark: event.unicodeMark,
        tier: event.tier,
        position: {
          tokenIndex: mappedToken,
          letterIndex: lastLetterIndex(aramaicTokens[mappedToken]),
        },
        confidence: conf.score,
        reasons: conf.reasons,
      });
    }
  }

  return enforceConstraints(output, aramaicTokens, config);
}
