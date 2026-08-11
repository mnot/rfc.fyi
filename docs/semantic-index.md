# Maintaining the semantic index

Full-text search runs against a vector index built from the RFC text files.
It is built by hand, published as a GitHub release, and collected by the
deploy workflow. Nothing about it happens in CI.

Plan on doing this monthly.

## Before you start

- `gh` logged in, with permission to create and delete releases.
- The Python venv: `make venv` if `.venv/` is missing.
- About 2 GB free — `var/` holds the corpus, the chunks and the vectors.

## The monthly update

```
make index-fetch     # download the published index into index/
make index           # rsync the corpus, embed what is new, rebuild
make index-verify    # check the result
make index-release   # publish it
```

`make index` takes a few minutes. It prints three lines worth reading:

```
hydrated 441,121 vectors from index (455,953 available, 3 RFCs changed so 142 rows were left out)
457,156 chunks, 0 cached locally, 441,121 hydrated, 1,203 to embed (bge-small/int8)
wrote 4,337 clusters + centroids to index: 186.9 MiB total
```

- **RFCs changed** is how many have been reissued since the last build. Their
  chunks are re-embedded.
- **to embed** should be in the low thousands for a month's worth of new
  RFCs. If it is a large fraction of the corpus the run stops rather than
  spending hours; see Troubleshooting.
- **hydrated plus to embed comes to less than the chunk count.** About 15,000
  chunks repeat text that appears elsewhere in the series -- boilerplate,
  mostly -- and the cache is keyed by text, so one vector serves all of them.

`make index-verify` prints a JSON report. Check:

- `coverage.ok` and `assignment.ok` are both `true` — the command exits
  non-zero if either is false.
- `recall.recall` is around 0.89.
- `clusters.over_cap` in `index/manifest.json` is not climbing steeply. Once
  it passes about 100, do a full rebuild.

`make index-release` uploads `index.tar.gz` under a tag taken from the build
id, e.g. `index-20260811T003915Z`, and deletes all but the two most recent.

## Getting it live

The deploy workflow picks up the newest `index-*` release on its next run,
which is the daily cron, any push to `main`, or a manual run:

```
gh workflow run pages.yml
```

Then check the deployed site:

```
curl -s https://rfc.fyi/index/current.json
```

The build id there should match the tag you released.

## Full rebuild

Needed after changing the chunker, the embedding model, the cluster count, or
anything else in `bin/chunk.py` or the clustering parameters.

```
make index-full      # about six hours
make index-verify
make index-release
```

`make index-full` discards `index/` and `var/embeddings` first, so nothing
carries over.

## Building from scratch on a new machine

`make index-fetch` is enough — the published release contains everything an
incremental build needs. There is no local state to move between machines.

## Troubleshooting

**`no index/ to build on`**
`make index` needs the previous build. Run `make index-fetch`, or
`make index-full` if there is no release yet.

**`--hydrate index: no sources.json`**
The release predates per-RFC digests. Do a full rebuild.

**`--hydrate index: chunker code abc123 -> def456`** (or `chunker settings …`)
`bin/chunk.py` has changed, so it no longer produces the text those vectors
were built from and none of them can be reused. Do a full rebuild. Comments
and formatting do not trigger this; anything the chunker computes does,
including its docstrings.

**`errors: 1` and a non-zero exit from `chunk.py`**
A file failed to chunk. That RFC would be missing from the index and from the
digests, so the run stops. Fix the file or the chunker before continuing --
the named file is in the error output.

**`… would be embedded, over the 25% limit for a hydrated run`**
Either `index/` is not the previous build of this corpus, or the chunker has
changed and every offset moved. Use `make index-full`. To embed anyway, add
`--max-new 1` to the `embed-corpus.py` line.

**`index/: unexpected entries beside <build>`**
`make site` found more than one build directory in `_site/index/`. Run
`make clean` — or just `rm -rf _site` — and build again.

**Full-text search says it is unavailable on the deployed site**
No index release exists, or the workflow could not download it. The workflow
log's "Unpack the semantic index" step says which.

## What gets published where

| | |
|---|---|
| `index/` | the build, locally |
| `index.tar.gz` on a release | what the deploy collects |
| `_site/index/<build>/` | what the site serves |
| `_site/index/current.json` | names the build the site is serving |
| `index/sources.json` | per-RFC digests, read by the next build |
| `var/embeddings` | local float32 vectors; disposable |
