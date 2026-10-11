# Making a release

**This guide publishes a release: the standalone `ksplc` for Linux, macOS and Windows, and the two VS Code extensions, attached to a GitHub Release.** You need push access to the repository and a `main` whose gates are green. The release is built by `.github/workflows/release.yml`; nothing is built on your machine for it.

Caution: **Pushing the tag starts the workflow**, which builds on three platforms and spends the account's Actions minutes (a macOS minute costs ten Linux minutes in a private repository). Push it once, when the steps before it pass.

## Before the tag

1. **Run the gates on the commit you will tag**:

   ```sh
   make ci-linux             # last line: RESULT: ALL PASS
   ```

   The release workflow runs no suite of its own: it only builds. A red gate here ships.
2. **Check the shipped build reproduces the compiler**, as each platform's job will:

   ```sh
   make self-host-ship       # last line: RESULT: ALL PASS (the shipped executable, c backend)
   ```

3. **Pick the version.** The tag's name (`v0.1.5` and so on) is the only version: it goes into the files' names, and nothing in the source holds it. The extensions' own `package.json` keep `"version": "0.1.0"` whatever the tag; nothing checks it.
4. **What the zip carries is listed in two places that change together**: the packing steps of `release.yml` and `released` in `tests/support/conventions_notice.kspls`. The zip's `README.md` is `tools/release-assets/README.md`, and each of its code blocks must stand whole in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) or the root [`README.md`](../README.md); `make test-conventions` checks both.

## The tag

5. **Tag the commit on `main` and push the tag**:

   ```sh
   git tag v0.1.5
   git push origin v0.1.5
   ```

   The workflow can also be started by hand from the Actions tab ("Run workflow"), naming the tag; it then creates the tag at that commit.

## What the workflow does

6. **`build`**, once per platform (`linux-x64`, `macos-arm64`, `windows-x64` on MSYS2 UCRT64): `make self-host-ship`, then a zip `ksplc-<tag>-<platform>.zip` holding `ksplc`, `std/`, the VS Code settings, `kspl_lldb.py`, the README and the licence. On Windows it first refuses an executable that needs a DLL from the toolchain.
7. **`package-vscode-ext`**: puts each platform's `ksplc` into the extension as its language server, and packs `kspl-<tag>.vsix` and `kspeg-<tag>.vsix`.
8. **`release`**: attaches the three zips and two `.vsix` to the tag's Release, with release notes GitHub writes from the merged pull requests.

## After

9. **Open the Release page and check five files are attached.** A platform that failed leaves its zip out (the platforms do not stop each other); fix the cause and start the workflow again by hand for the same tag.
