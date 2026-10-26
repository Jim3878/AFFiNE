# NineDay build: the official AFFiNE image with only the web frontend replaced.
# The backend (packages/backend, AFFiNE EE License) stays the official build untouched;
# only MIT-licensed frontend code is rebuilt. admin/ and mobile/ are kept from upstream.
ARG BASE_IMAGE=ghcr.io/toeverything/affine:0.27.4
FROM ${BASE_IMAGE}

RUN find /app/static -mindepth 1 -maxdepth 1 ! -name admin ! -name mobile -exec rm -rf {} +
# Build context is packages/frontend/apps/web/dist (see nineday-image.yml).
COPY . /app/static/

LABEL org.opencontainers.image.source="https://github.com/Jim3878/AFFiNE" \
      org.opencontainers.image.description="AFFiNE 0.27.4 with NineDay frontend changes (backend unchanged)"
