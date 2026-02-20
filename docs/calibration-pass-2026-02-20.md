# Calibration Pass Report (2026-02-20)

- Dataset: local PDFs from /book_sources (first page from each selected PDF)
- Source PDFs:
  - Hebrewbooks_org_45803.pdf
  - Hebrewbooks_org_22405.pdf
  - Hebrewbooks_org_42687.pdf
  - Hebrewbooks_org_21711.pdf
  - Hebrewbooks_org_43164.pdf
  - Hebrewbooks_org_42117.pdf
  - Hebrewbooks_org_42118.pdf
  - Hebrewbooks_org_42329.pdf
  - Hebrewbooks_org_42735.pdf
  - Hebrewbooks_org_42071.pdf
- Witness: calibration_book_sources_p1
- OCR engine: command-json-mock
- Pages processed: 10

## Results
- Mean OCR confidence: 0.820
- Mean OCR coverage estimate: 0.880
- Split partial count: 0
- Split success count: 10

## Notes
- Flow executed end-to-end: ingest -> region annotate -> OCR -> split.
- Input pages were derived from local /book_sources PDFs (no network fetch).
