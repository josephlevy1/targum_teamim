export type VerseId = `${string}:${number}:${number}`;
export type TokenId = string;
export type LetterId = string;
export type TaamId = string;

export type WitnessType = "TORAH_HE" | "TARGUM_AR" | "MANUSCRIPT_AR";
export type TaamTier = "DISJUNCTIVE" | "CONJUNCTIVE" | "METEG_LIKE" | "PISUQ";

export interface TextWitness {
  id: string;
  name: string;
  type: WitnessType;
  metadata?: Record<string, string>;
}

export interface TaamPosition {
  tokenId: TokenId;
  letterId: LetterId;
  offset?: number;
}

export interface Taam {
  taamId: TaamId;
  name: string;
  unicodeMark: string;
  tier: TaamTier;
  position: TaamPosition;
}

export interface Letter {
  letterId: LetterId;
  baseChar: string;
  niqqud: string[];
  taamim: Taam[];
}

export interface Token {
  tokenId: TokenId;
  surface: string;
  letters: Letter[];
}

export interface Verse {
  id: VerseId;
  hebrewTokens: Token[];
  aramaicTokens: Token[];
}

export interface TaamEvent {
  taamId: TaamId;
  name: string;
  unicodeMark: string;
  tier: TaamTier;
  hebAnchor: {
    tokenIndex: number;
    letterIndex: number;
  };
}

export interface GeneratedTaam {
  taamId: TaamId;
  name: string;
  unicodeMark: string;
  tier: TaamTier;
  position: {
    tokenIndex: number;
    letterIndex: number;
  };
  confidence: number;
  reasons: string[];
}

export interface TransposeConfig {
  disjunctiveBoundaries: string[];
  taamPrecedence: string[];
  sofPasukName: string;
}

export type PatchOp =
  | {
      type: "MOVE_TAAM";
      taamId: string;
      from: { tokenIndex: number; letterIndex: number };
      to: { tokenIndex: number; letterIndex: number };
    }
  | {
      type: "SWAP_TAAM";
      taamId: string;
      oldName: string;
      newName: string;
      newUnicodeMark: string;
      newTier: TaamTier;
    }
  | {
      type: "DELETE_TAAM";
      taamId: string;
    }
  | {
      type: "INSERT_TAAM";
      taam: GeneratedTaam;
    };

export interface PatchEntry {
  id: string;
  verseId: VerseId;
  op: PatchOp;
  sourceType: "manual" | "import" | "automation";
  sourceWitnessId?: string | null;
  author: string;
  note?: string;
  createdAt: string;
  seqNo: number;
}

export interface VerseState {
  verified: boolean;
  flagged: boolean;
  manuscriptNotes: string;
  patchCursor: number;
}
