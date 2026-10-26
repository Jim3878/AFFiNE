# NineDay build: the official AFFiNE image with the web and mobile-web frontends replaced.
# The backend (packages/backend, AFFiNE EE License) stays the official build untouched;
# only MIT-licensed frontend code is rebuilt. admin/ is kept from upstream.
ARG BASE_IMAGE=ghcr.io/toeverything/affine:0.27.4
FROM ${BASE_IMAGE}

RUN find /app/static -mindepth 1 -maxdepth 1 ! -name admin -exec rm -rf {} +
# Build context is nineday-static/: web dist at the root, mobile dist in mobile/ (see nineday-image.yml).
COPY . /app/static/

LABEL org.opencontainers.image.source="https://github.com/Jim3878/AFFiNE" \
      org.opencontainers.image.description="AFFiNE 0.27.4 with NineDay frontend changes (backend unchanged)"
