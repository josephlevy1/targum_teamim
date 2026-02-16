# Run Sequence (RNV)

1. Install dependencies:
```bash
pnpm install
```

2. Start dev server:
```bash
pnpm dev
```

3. Import source files (TSV: `verse_id<TAB>text`):
```bash
pnpm --filter web import:hebrew --file=/absolute/path/hebrew.tsv
pnpm --filter web import:targum --file=/absolute/path/targum.tsv
```

4. Run transposition for a range:
```bash
pnpm --filter web transpose --range=Genesis:1:1-Genesis:1:31
```

5. Open app:
- http://localhost:3000

6. Optional validation before commit:
```bash
pnpm typecheck
pnpm test
pnpm build
```
