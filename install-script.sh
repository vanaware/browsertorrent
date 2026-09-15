#!/usr/bin/env bash
set -e

echo "📦 Checking and installing zip/unzip prerequisites..."
if ! command -v zip >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  echo "Installing zip and unzip via apt-get..."
  DEBIAN_FRONTEND=noninteractive apt-get update -y && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    zip unzip
fi

echo "🦕 Checking Deno installation..."
if ! command -v deno >/dev/null 2>&1; then
  echo "Installing Deno unattended (-y)..."
  curl -fsSL https://deno.land/install.sh | sh -s -- -y
  ln -sf /root/.deno/bin/deno /usr/local/bin/deno
  ln -sf /root/.deno/bin/deno /usr/bin/deno
fi

echo "✅ Deno ready: $(deno --version | head -n 1)"

echo "🤹 Checking TaskJuggler (tj3) installation..."
if ! command -v tj3 >/dev/null 2>&1; then
  echo "Installing ruby, ruby-dev, build-essential..."
  DEBIAN_FRONTEND=noninteractive apt-get update -y && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    ruby ruby-dev build-essential
  echo "Installing taskjuggler gem..."
  gem install taskjuggler --no-document
fi

TJ3_BIN=$(command -v tj3 || find / -name tj3 2>/dev/null | head -n 1)
if [ -n "$TJ3_BIN" ]; then
  if [ "$TJ3_BIN" != "/usr/local/bin/tj3" ]; then
    ln -sf "$TJ3_BIN" /usr/local/bin/tj3
  fi
  if [ "$TJ3_BIN" != "/usr/bin/tj3" ]; then
    ln -sf "$TJ3_BIN" /usr/bin/tj3
  fi
fi

if command -v tj3 >/dev/null 2>&1; then
  echo "✅ TaskJuggler ready: $(tj3 --version)"
fi
