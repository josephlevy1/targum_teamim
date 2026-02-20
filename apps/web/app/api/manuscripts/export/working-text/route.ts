import { NextResponse } from "next/server";
import { MANUSCRIPT_NORMALIZATION_FORM } from "@targum/core";
import { getRepository } from "@/lib/repository";

function baselineText(repo: ReturnType<typeof getRepository>, verseId: string): string {
  const record = repo.getVerseRecord(verseId as any);
  if (!record) return "";
  return record.verse.aramaicTokens
    .map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join(""))
    .join(" ");
}

export async function GET() {
  const repo = getRepository();
  const verseIds = repo.listVerseIds();
  const lines = verseIds.map((verseId) => {
    const working = repo.getWorkingVerseText(verseId);
    const text = (working?.selectedTextSurface || baselineText(repo, verseId)).normalize(MANUSCRIPT_NORMALIZATION_FORM);
    return `${verseId}\t${text}`;
  });

  return new NextResponse(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=working_aramaic.tsv",
    },
  });
}
