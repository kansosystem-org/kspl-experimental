# Making a release

**This guide publishes a release: the standalone `ksplc` for Linux, macOS and Windows, and the two VS Code extensions, attached to a GitHub Release.** You need push access to the repository, and a commit on `main` that a complete CI run has passed on. `.github/workflows/release.yml` builds the release; nothing is built on your machine for it.

Caution: **Pushing the tag starts the workflow**, which builds on three platforms and spends the account's Actions minutes (a macOS minute costs ten Linux minutes). Push it once, when the steps before it pass.

## Before the tag

1. **Run the gates on the commit you will tag, on Linux** (a Linux machine, or the dev container). Only there does `make ci` run the Linux-only gates ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)), and the workflow runs no suite of its own:

   ```sh
   make ci             # last line: # ci: ALL GREEN
   ```

2. **Check the shipped build reproduces the compiler**, as each platform's job will:

   ```sh
   make self-host-ship       # last line: RESULT: ALL PASS (the shipped executable, c backend)
   ```

3. **Run CI on that commit, with every job ticked.** From the Actions tab, open CI and press "Run workflow" on `main` while its head is that commit. The release refuses a commit that no complete `ci.yml` run passed on (step 7). The weekly round may not have run on it ("How CI runs" in [`SPEC-gates.md`](SPEC-gates.md)).
4. **Pick the version.** The tag's name (`v0.1.5` and so on) is the only version, used in the files' names. The extensions' `package.json` keep `"version": "0.1.0"` whatever the tag.
5. **What the zip carries is listed in two places that change together**: the packing steps of `release.yml` and `RELEASED` in `tests/support/conventions_notice.kspl`. The zip's `README.md` is `tools/release-assets/README.md`. Each of its code blocks must stand whole in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) or the root [`README.md`](../README.md); `make test-conventions` checks both.

## The tag

6. **Tag the commit on `main` and push the tag**:

   ```sh
   git tag v0.1.5
   git push origin v0.1.5
   ```

   A run started by hand from the Actions tab can also name a tag that does not exist yet. It builds the head of the branch chosen in "Use workflow from", and creates the tag there.

## What the workflow does

7. **`tag`** refuses two runs before any platform spends its minutes:
   * **A tag that already exists at another commit than the one it builds**, as a hand run naming an existing tag would. A pushed tag always passes.
   * **A commit that no `ci.yml` run passed on with every job.** A run with a job unticked does not count. The refusal says to run CI by hand (step 3); once it passes, press "Re-run all jobs" on the refused run.
8. **`build`**, once per platform (`linux-x64`, `macos-arm64`, `windows-x64` on MSYS2 UCRT64). It runs `make self-host-ship`, then makes `ksplc-<tag>-<platform>.zip`. The zip holds `ksplc`, `std/`, the VS Code settings, `kspl_lldb.py`, the README and the licence. On Windows it first refuses an executable that needs a DLL from the toolchain. **Then the `ksplc` unpacked outside the checkout builds and runs a hello program**, so a missing or misplaced `std/` fails here.
9. **`package-vscode-ext`**: packs `kspl-<tag>.vsix`, with each platform's `ksplc` as its language server, and `kspeg-<tag>.vsix`.
10. **`release`**: attaches the three zips and two `.vsix` to the tag's Release, with release notes GitHub writes from the merged pull requests.

## After

11. **Open the Release page and check five files are attached.**

**A failed job attaches nothing**: `release` runs only once every `build` and `package-vscode-ext` has passed. The other platforms still finish, and their zips stay on the run's page as artifacts. What to do depends on where the cause is:

| The cause | What to do |
| :-- | :-- |
| Outside the source: a runner, or a download that failed | Press "Re-run failed jobs" on that run's page. It builds the same commit again, then packs and releases |
| In the source | Land the fix on `main`, take steps 1 to 3 on it, and tag it with the next version. A hand run naming the same tag cannot carry the fix, since `tag` refuses a run that builds another commit. **Do not move the tag onto the fix**: a clone that fetched the tag keeps the old commit under that name. The failed tag names no Release, and `git push origin --delete <tag>` removes it |
