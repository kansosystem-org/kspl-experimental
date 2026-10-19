# Making a release

**This guide publishes a release: the standalone `ksplc` for Linux, macOS and Windows, and the two VS Code extensions, attached to a GitHub Release.** You need push access to the repository, and a commit on `main` that a complete CI run has passed on. The release is built by `.github/workflows/release.yml`; nothing is built on your machine for it.

Caution: **Pushing the tag starts the workflow.** The workflow builds on three platforms and spends the account's Actions minutes. In a private repository, a macOS minute costs ten Linux minutes. Push it once, when the steps before it pass.

## Before the tag

1. **Run the gates on the commit you will tag, on Linux** (a Linux machine, or the repository opened in the dev container):

   ```sh
   make ci             # last line: # ci: ALL GREEN
   ```

   The release workflow runs no suite of its own: it builds, and runs one program with what it packed. Only on Linux does `make ci` run the Linux-only gates; elsewhere it leaves them out ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)).
2. **Check the shipped build reproduces the compiler**, as each platform's job will:

   ```sh
   make self-host-ship       # last line: RESULT: ALL PASS (the shipped executable, c backend)
   ```

3. **Run CI on that commit, with every job ticked.** From the Actions tab, open CI, press "Run workflow" on `main` while its head is the commit you will tag, and leave all three jobs ticked. The release refuses a commit that no `ci.yml` run passed on with every job (step 7), and CI's weekly round has not always run on it. The run spends the account's minutes, macOS's most ("How CI runs" in [`SPEC-gates.md`](SPEC-gates.md)).
4. **Pick the version.** The tag's name (`v0.1.5` and so on) is the only version: it goes into the files' names, and nothing in the source holds it. The extensions' own `package.json` keep `"version": "0.1.0"` whatever the tag; nothing checks it.
5. **What the zip carries is listed in two places that change together**: the packing steps of `release.yml` and `RELEASED` in `tests/support/conventions_notice.kspl`. The zip's `README.md` is `tools/release-assets/README.md`, and each of its code blocks must stand whole in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) or the root [`README.md`](../README.md); `make test-conventions` checks both.

## The tag

6. **Tag the commit on `main` and push the tag**:

   ```sh
   git tag v0.1.5
   git push origin v0.1.5
   ```

   The workflow can also be started by hand from the Actions tab ("Run workflow"), naming a tag that does not exist yet. It builds the head of the branch chosen in "Use workflow from", and creates the tag there.

## What the workflow does

7. **`tag`** refuses two runs before any platform spends its minutes:
   * **A tag that already exists at another commit than the one it builds.** A hand run naming an existing tag would otherwise attach zips built from the branch's head to a tag that names an older commit. A pushed tag always passes.
   * **A commit that no `ci.yml` run passed on with every job.** The workflow runs no gate, so without this a tag ships whatever it names. A run by hand with a job unticked does not count: it is green over the platforms it ran alone. The refusal says to run CI by hand (step 3); once it passes, press "Re-run all jobs" on the refused run.
8. **`build`**, once per platform (`linux-x64`, `macos-arm64`, `windows-x64` on MSYS2 UCRT64). It runs `make self-host-ship`, then makes a zip `ksplc-<tag>-<platform>.zip`. The zip holds `ksplc`, `std/`, the VS Code settings, `kspl_lldb.py`, the README and the licence. On Windows it first refuses an executable that needs a DLL from the toolchain. **Then it unpacks the zip into a folder outside the checkout. The unpacked `ksplc` builds and runs a hello program.** So a zip whose `std/` is missing or misplaced fails here, not on a user's machine.
9. **`package-vscode-ext`**: puts each platform's `ksplc` into the extension as its language server, and packs `kspl-<tag>.vsix` and `kspeg-<tag>.vsix`.
10. **`release`**: attaches the three zips and two `.vsix` to the tag's Release, with release notes GitHub writes from the merged pull requests.

## After

11. **Open the Release page and check five files are attached.**

**A failed job attaches nothing.** `release` runs only once every platform's `build` and `package-vscode-ext` have passed. So one platform's failure leaves no Release at all. The extension carries all three platforms' `ksplc`, so it is not packed either. The other platforms still finish (they do not stop each other), and their zips stay on the run's page as artifacts, not on a Release. What to do depends on where the cause is:

| The cause | What to do |
| :-- | :-- |
| Outside the source: a runner, or a download that failed | Press "Re-run failed jobs" on that run's page. It builds the same commit again, then packs and releases |
| In the source | Land the fix on `main`, take steps 1 to 3 on it, and tag it with the next version. A run by hand naming the same tag cannot carry the fix. The tag names the commit before the fix. `tag` refuses a run that builds another commit. **Do not move the tag onto the fix.** A clone that has fetched the tag keeps the old commit under that name. Git does not replace a tag that it already holds. The failed tag names no Release, and `git push origin --delete <tag>` removes it |
