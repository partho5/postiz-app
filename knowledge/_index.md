# Knowledge Base — Contributor Guide

This directory contains the autopilot chatbot's knowledge base.
Every file here is automatically embedded into the vector database on each deploy.

## File conventions

- One `# Title` per file (first line)
- Sections use `## Section heading` — the embedder splits on these
- Keep each section focused on one idea (roughly 100–300 words)
- Plain prose, no code blocks required

## Adding new content

1. Create a new `.md` file or add a `## Section` to an existing file
2. Run `pnpm run seed:knowledge` locally to verify it embeds without error
3. Commit and push — the next `./deploy.sh restart` will embed it automatically

## File structure

One file per domain area of the product. Add `## sections` to an existing file before creating a new one. Only create a new file when the topic is genuinely a separate domain.

| File | Domain |
|---|---|
| `autopilot.md` | Everything about the autopilot chat feature |
