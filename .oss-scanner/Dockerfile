# syntax=docker/dockerfile:1
# Anthropic OSS Scanner builds this public develop checkout with Internet access,
# then removes Internet access when it audits the built image.
FROM ghcr.io/geniusventures/almalinux-8:latest

ENV CI=1 \
    NODE_ENV=development \
    HARDHAT_NETWORK=hardhat \
    PYTHON=/usr/bin/python3.9

# Node 24/Clang/etc. are in the shared AlmaLinux image. Use a Python version
# accepted by node-gyp when native npm dependencies need a compiler.
RUN dnf install -y python39 python39-pip && dnf clean all
WORKDIR /src
COPY . /src

# Keep the recorded gitlink revisions. Rewrite public GitHub SSH submodule URLs
# to anonymous HTTPS; do not use deploy keys, GitHub tokens, or build secrets.
RUN git config --global --add url."https://github.com/".insteadOf "git@github.com:" \
 && git submodule sync --recursive \
 && git submodule update --init --recursive

# Use the precise Yarn CLI version named in package.json (Yarn 4.9.4).
RUN npm install --global @yarnpkg/cli-dist@4.9.4 \
 && yarn --version \
 && yarn install --immutable

# Fetch and cache solc at image-build time. Keep Solidity compilation output,
# proxy/diamond generated ABI, dependencies, and local tests for offline scans.
RUN yarn compile \
 && test -d node_modules \
 && test -d artifacts \
 && test -d diamond-typechain-types

CMD ["/bin/bash"]
