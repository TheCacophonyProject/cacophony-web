#!/bin/bash
apt-get update
apt-get install -y apt-utils
apt-get install -y tzdata
echo "Pacific/Auckland" > /etc/timezone
ln -sf /usr/share/zoneinfo/Pacific/Auckland /etc/localtime
# NOTE: Removed, since it just makes the image bigger, and doesn't help us at all in running things in travis.
#apt-get update --fix-missing
apt-get -y install curl sudo make build-essential g++ git python3

# install postgres
apt-get -y install postgis postgresql postgresql-contrib libpq-dev
echo "listen_addresses = '*'" >> /etc/postgresql/14/main/postgresql.conf
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/14/main/pg_hba.conf
echo "host all all ::/0 md5" >> /etc/postgresql/14/main/pg_hba.conf

if [ $1 == "arm64" ]; then
  # arm64 builds
  curl --location --fail --silent --show-error --remote-name https://dl.minio.io/server/minio/release/linux-arm64/minio
  curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-arm64/mc > mc
else
  # Default is amd64
  # install minio
  # https://minio.io/downloads.html#download-server-linux-x64
  # https://docs.minio.io/docs/minio-client-complete-guide
  curl --location --fail --silent --show-error --remote-name https://dl.minio.io/server/minio/release/linux-amd64/minio > /minio
  curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-amd64/archive/mc.RELEASE.2019-07-11T19-31-28Z > /mc
fi
chmod +x /minio
chmod +x /mc

#install nodex
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# install packages - this still has to be done each time because of updates but doing it
# on the base means there are fewer packages to install
npm i -g npm
npm install
npm cache ls
# Bcrypt are sharp are natively compiled, so we can't just get them from the npm cache.
# Instead we copy them over to avoid having to ship all the native build tools in the docker image.
mv ./node_modules/bcrypt ./bcrypt && mv ./node_modules/sharp ./sharp && mv ./node_modules/detect-libc ./detect-libc && mv ./node_modules/color ./color
rm -rf ./node_modules
npm cache verify

# clean up our apt modules if we've already used them
apt-get -y remove make build-essential g++ python3 curl
apt-get -y autoremove
dpkg --list |grep "^rc" | cut -d " " -f 3 | xargs sudo dpkg --purge
apt-get clean
rm -rf /var/lib/apt/lists/*
