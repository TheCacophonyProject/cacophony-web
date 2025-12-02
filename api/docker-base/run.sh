#!/bin/bash
apt-get update
apt-get install -y apt-utils
apt-get install -y tzdata
echo "Pacific/Auckland" > /etc/timezone
ln -sf /usr/share/zoneinfo/Pacific/Auckland /etc/localtime
# NOTE: Removed, since it just makes the image bigger, and doesn't help us at all in running things in travis.
#apt-get update --fix-missing
apt-get -y install curl sudo make build-essential g++ git python3 ca-certificates
# Get the postgres key so we can install postgres 18, while ubuntu 24.04 has 16 in its package manager
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
# Add postgres repository (note, if not ubuntu24.04, substitute `noble` with release name.)
echo "deb http://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update

echo "Installing ffmpeg"
apt-get -y install ffmpeg
# install postgres
apt-get -y install postgresql-18
apt-get -y install postgis postgresql-18-postgis-3 postgresql-contrib-18 libpq-dev postgresql-client-18
echo "listen_addresses = '*'" >> /etc/postgresql/18/main/postgresql.conf
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/18/main/pg_hba.conf
echo "host all all ::/0 md5" >> /etc/postgresql/18/main/pg_hba.conf

# This is all run in the context of the container image, so it should evaluate the architecture of the image (I think)
ARCH=$(uname -m)

if [ "$ARCH" == "aarch64" ]; then
  # arm64 builds
  curl --location --fail --silent --show-error https://dl.minio.io/server/minio/release/linux-arm64/minio > /minio
  curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-arm64/mc > /mc
else
  # Default is amd64
  # install minio
  # https://minio.io/downloads.html#download-server-linux-x64
  # https://docs.minio.io/docs/minio-client-complete-guide
  curl --location --fail --silent --show-error https://dl.minio.io/server/minio/release/linux-amd64/minio > /minio
  curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-amd64/mc > /mc
fi
chmod +x /minio
chmod +x /mc

#install node
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
apt-get install -y nodejs

# install packages - this still has to be done each time because of updates but doing it
# on the base means there are fewer packages to install
npm install --no-audit
npm cache ls
# Bcrypt are sharp are natively compiled, so we can't just get them from the npm cache.
# Instead we copy them over to avoid having to ship all the native build tools in the docker image.
mv ./node_modules/bcrypt ./bcrypt && mv ./node_modules/sharp ./sharp && mv ./node_modules/detect-libc ./detect-libc && mv ./node_modules/color ./color
rm -rf ./node_modules
npm cache verify

# Make sure `apt-get autoremove` doesn't remove nodejs, since it falsely thinks it's an unused dependency of another package.
apt-mark manual nodejs
apt-mark hold nodejs
# clean up our apt modules if we've already used them
apt-get -y remove make build-essential g++ python3 curl ca-certificates
apt-get -y autoremove
dpkg --list | grep "^rc" | cut -d " " -f 3 | xargs sudo dpkg --purge
apt-get install -y nodejs
apt-get clean
rm -rf /var/lib/apt/lists/*
