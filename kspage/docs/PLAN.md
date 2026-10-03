# kspage — what is left

**Only what is not done stands here.** A finished stage is deleted, and its result moves to the document of its kind ("Document naming" in [`SPEC-documents.md`](../../docs/SPEC-documents.md)). Work that spans packages is in [`docs/PLAN.md`](../../docs/PLAN.md). The decisions and their grounds are in [`kspage/docs/DESIGN.md`](DESIGN.md). What the reader is told about kspage's gaps is the manual's last chapter (opened from the page's `?`).

| | What is left | What marks it as done |
| :-- | :-- | :-- |
| stage 1 | **Writing the built constants back into the source file.** A table builds its constants text and says whether the text at its target is stale ("Pointing at the source and showing it" in [`kspage/docs/DESIGN.md`](DESIGN.md)). But the text is only downloaded. The page can write a file through the local server (`PUT /api/file` in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)), or in desktop Chromium through a handle the person picks | One press writes the built text over the table's target file. The write is refused if that file changed after the page read it |
