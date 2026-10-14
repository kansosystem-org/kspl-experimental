# The image for developing the Kanso compiler; CI's Linux job uses it as it stands.

# **Pinned by digest**: the tag moves, and a moved base changes the image on a day nobody touched
# this file. Dependabot proposes the next digest (`.github/dependabot.yml`).
FROM ubuntu:26.04@sha256:f144425ff09be612d6d9ad965196e9cdc23dae1f42110a8a11a3e9a8198759f7

# --- Fetch over IPv4: apt ---
# **Do not take this out**: the runner has no IPv6 route, and a source answering with an AAAA
# record stops the image build at `Network is unreachable`.
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# --- The plain tools ---
# Caution: **Name, per tool, the target that calls it**, or what the default build leaves alone
# looks unused and goes. This is the tool list's canonical source; no mingw-w64 (Windows is
# watched on real hardware).
#   BLAS=1: libopenblas-dev · test-ksos-qemu: qemu-system-arm · bare metal: gcc-arm-none-eabi
#   ksbind's own test (test-extract): libssl-dev, libsqlite3-dev · test-kspage-wasm: nodejs
#   test-pytools: python3-numpy (without it, a silent SKIP) · test-kspage-desktop: desktop-file-utils
#   the HTTPS download below (Chromium): ca-certificates
# No pip: nothing here installs from it (the AI helpers' own venv brings its own).
RUN apt-get update && apt-get install -y \
    python3 \
    nodejs \
    python3-numpy \
    python-is-python3 \
    make \
    git \
    locales \
    wget \
    ca-certificates \
    build-essential \
    libopenblas-dev \
    libssl-dev \
    libsqlite3-dev \
    qemu-system-arm \
    gcc-arm-none-eabi \
    desktop-file-utils \
    && rm -rf /var/lib/apt/lists/*

# --- Fetch over IPv4: wget ---
# **Do not move this above the install**: `/etc/wgetrc` is wget's conffile, and one already
# there stops dpkg at a prompt with no stdin.
RUN echo 'inet4_only = on' >> /etc/wgetrc

# --- UTF-8 ---
# Caution: The sources are UTF-8; on another locale they are garbled before ksplc reads them.
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# --- LLVM 22 (Ubuntu's own packages) ---
# **From the base image's own archive**, signed by Ubuntu and updated with the rest of the system:
# no other source and no other key. Caution: **Take the major version from this release's
# archive**: a version it lacks needs a third-party source, built for another release.
# The packages: clang-22, lldb-22, lld-22 and clangd-22, then clang-format-22 (the Makefile's
# `C_FMT`, which `make commit-seed` requires), llvm-22 (OBJDUMP / OBJCOPY / NM) and
# libclang-rt-22-dev (the sanitizers `make test-ksai-fuzz` and `make test-race` build with), and
# libclang-rt-22-dev-wasm32 (clang's builtins a wasm32 module links: kspage's page, layout-targets).
RUN apt-get update && \
    apt-get install -y clang-22 lldb-22 lld-22 clangd-22 clang-format-22 llvm-22 \
        libclang-rt-22-dev libclang-rt-22-dev-wasm32 && \
    rm -rf /var/lib/apt/lists/*

# --- Letting the unversioned names through ---
# **The Makefile calls the unversioned names**; a tool left out here fails as command not found.
RUN update-alternatives --install /usr/bin/clang clang /usr/bin/clang-22 100 && \
    update-alternatives --install /usr/bin/clang++ clang++ /usr/bin/clang++-22 100 && \
    update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-22 100 && \
    update-alternatives --install /usr/bin/lldb lldb /usr/bin/lldb-22 100 && \
    update-alternatives --install /usr/bin/ld.lld ld.lld /usr/bin/ld.lld-22 100 && \
    update-alternatives --install /usr/bin/wasm-ld wasm-ld /usr/bin/wasm-ld-22 100 && \
    update-alternatives --install /usr/bin/llvm-objdump llvm-objdump /usr/bin/llvm-objdump-22 100

# --- A real browser (`make test-kspage-browser` uses it) ---
# Focus, visibility and repeated keystrokes break only in a real browser. Ubuntu's `chromium`
# is a snap stub that does not run in a container, so the Chromium project's zip (BSD) goes in
# instead; **amd64 only** (elsewhere the target emits SKIPPED).
# Caution: **Pin the revision, and take the build that has a head**: options, window size and
# the permission to open a window move within weeks, and headless lacks that permission (the
# caution in `kspage/Makefile`). The zip resolves no dependencies, so the libraries are listed.
ARG CHROMIUM_REVISION=1680435
# The zip's SHA-256 at that revision. **Change the two together**: the download is checked against
# it before it is unpacked, so a zip altered where it is stored does not go into the image.
ARG CHROMIUM_SHA256=b5d87794e36d5c02c174c1be3f0ff5d2bf236001056e4619c5ebb6e4867a724c
RUN apt-get update && apt-get install -y --no-install-recommends \
    unzip \
    fonts-liberation \
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libatspi2.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0t64 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/* && \
    wget -qO /tmp/chromium.zip \
        "https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${CHROMIUM_REVISION}/chrome-linux.zip" && \
    echo "${CHROMIUM_SHA256}  /tmp/chromium.zip" | sha256sum -c - && \
    unzip -q /tmp/chromium.zip -d /opt && rm /tmp/chromium.zip && \
    ln -s /opt/chrome-linux/chrome /usr/local/bin/chromium

# --- Allowing sudo for the plain 'ubuntu' user (UID 1000) ---
# Caution: **Remove the lists in the same layer**, as every step above does, or they stay in the
# image for good.
RUN apt-get update \
    && apt-get install -y --no-install-recommends sudo \
    && rm -rf /var/lib/apt/lists/* \
    && echo "ubuntu ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu \
    && install -d -o ubuntu -g ubuntu /workspaces/kanso-ci

USER ubuntu
