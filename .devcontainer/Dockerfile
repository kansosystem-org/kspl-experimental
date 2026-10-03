# The image for developing the Kanso compiler; CI's Linux job uses it as it stands.

FROM ubuntu:24.04

# --- Fetch over IPv4: apt ---
# **Do not take this out**: the runner has no IPv6 route and apt.llvm.org answers with an AAAA
# record, so the image build stops at `Network is unreachable`.
RUN echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

# --- The plain tools ---
# Caution: **Name, per tool, the target that calls it**, or what the default build leaves alone
# looks unused and goes. This is the tool list's canonical source; no mingw-w64 (Windows is
# watched on real hardware).
#   BLAS=1: libopenblas-dev · test-ksos-qemu: qemu-system-arm · bare metal: gcc-arm-none-eabi
#   ci-linux (TLS=1 DB=1): libssl-dev, libsqlite3-dev · test-kspage-wasm: nodejs
#   test-pytools: python3-numpy · kspage: desktop-file-utils (without either, a silent SKIP)
RUN apt-get update && apt-get install -y \
    python3 \
    nodejs \
    python3-pip \
    python3-numpy \
    python-is-python3 \
    make \
    git \
    locales \
    lsb-release \
    wget \
    software-properties-common \
    gnupg \
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

# --- LLVM (the official script) ---
# **Do not add `all`**: it adds gigabytes the Linux job pulls every time, for not one gate.
# The rest: clang-format-19 (the Makefile's `C_FMT`), llvm-19 (OBJDUMP / OBJCOPY / NM),
# libclang-rt-19-dev (the sanitizers `make test-ksai-fuzz` and `make test-race` build with),
# clang-19 by name.
RUN wget https://apt.llvm.org/llvm.sh && \
    chmod +x llvm.sh && \
    ./llvm.sh 19 && \
    rm llvm.sh && \
    apt-get install -y clang-format-19 llvm-19 libclang-rt-19-dev && \
    rm -rf /var/lib/apt/lists/*

# --- Letting the unversioned names through ---
# **The Makefile calls the unversioned names**; a tool left out here fails as command not found.
RUN update-alternatives --install /usr/bin/clang clang /usr/bin/clang-19 100 && \
    update-alternatives --install /usr/bin/clang++ clang++ /usr/bin/clang++-19 100 && \
    update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-19 100 && \
    update-alternatives --install /usr/bin/lldb lldb /usr/bin/lldb-19 100 && \
    update-alternatives --install /usr/bin/ld.lld ld.lld /usr/bin/ld.lld-19 100 && \
    update-alternatives --install /usr/bin/wasm-ld wasm-ld /usr/bin/wasm-ld-19 100 && \
    update-alternatives --install /usr/bin/llvm-objdump llvm-objdump /usr/bin/llvm-objdump-19 100

# --- A real browser (`make test-kspage-browser` uses it) ---
# Focus, visibility and repeated keystrokes break only in a real browser. Ubuntu's `chromium`
# is a snap stub that does not run in a container, so the Chromium project's zip (BSD) goes in
# instead; **amd64 only** (elsewhere the target emits SKIPPED).
# Caution: **Pin the revision, and take the build that has a head**: options, window size and
# the permission to open a window move within weeks, and headless lacks that permission (the
# caution in `kspage/Makefile`). The zip resolves no dependencies, so the libraries are listed.
ARG CHROMIUM_REVISION=1680435
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
    unzip -q /tmp/chromium.zip -d /opt && rm /tmp/chromium.zip && \
    ln -s /opt/chrome-linux/chrome /usr/local/bin/chromium

# --- Allowing sudo for the plain 'ubuntu' user (UID 1000) ---
RUN apt-get update \
    && apt-get install -y sudo \
    && echo "ubuntu ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu