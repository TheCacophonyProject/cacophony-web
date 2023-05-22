# Build:                   sudo docker build --no-cache . -t cacophonyproject/server-base:latest
# Run interactive session: sudo docker run -it cacophony-api

# Build squashed version, using docker engine with experimental features enabled:
# DOCKER_BUILDKIT=0 docker build --squash --no-cache . -t cacophonyproject/server-base:ubuntu2204_arm64

FROM ubuntu:22.04

RUN apt-get update
RUN apt-get install -y apt-utils

RUN apt-get install -y tzdata
RUN echo "Pacific/Auckland" > /etc/timezone
RUN ln -sf /usr/share/zoneinfo/Pacific/Auckland /etc/localtime
RUN apt-get update --fix-missing
RUN apt-get -y install curl sudo make build-essential g++ git python3

# install postgres
RUN apt-get -y install postgis postgresql postgresql-contrib libpq-dev
RUN echo "listen_addresses = '*'" >> /etc/postgresql/14/main/postgresql.conf
RUN echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/14/main/pg_hba.conf
RUN echo "host all all ::/0 md5" >> /etc/postgresql/14/main/pg_hba.conf

# install minio
# https://minio.io/downloads.html#download-server-linux-x64
RUN curl --location --fail --silent --show-error --remote-name https://dl.minio.io/server/minio/release/linux-amd64/minio

# Note: uncomment if you're developing on arm64
#RUN curl --location --fail --silent --show-error --remote-name https://dl.minio.io/server/minio/release/linux-arm64/minio
#
RUN chmod +x minio

# https://docs.minio.io/docs/minio-client-complete-guide
RUN curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-amd64/archive/mc.RELEASE.2019-07-11T19-31-28Z > mc

# Note: uncomment if you're developing on arm64
#RUN curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-arm64/mc > mc
#
RUN chmod +x mc

#install nodex
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
RUN apt-get install -y nodejs

# install packages - this still has to be done each time because of updates but doing it
# on the base means there are fewer packages to install
WORKDIR /app
COPY package*.json ./
RUN npm i -g npm
RUN npm install
RUN npm cache ls
# Bcrypt are sharp are natively compiled, so we can't just get them from the npm cache.
# Instead we copy them over to avoid having to ship all the native build tools in the docker image.
RUN mv ./node_modules/bcrypt ./bcrypt && mv ./node_modules/sharp ./sharp && mv ./node_modules/detect-libc ./detect-libc && mv ./node_modules/color ./color
RUN rm -rf ./node_modules
RUN npm cache verify

# clean up our apt modules if we've already used them
RUN apt-get -y remove make build-essential g++ python3
RUN apt-get -y autoremove
RUN dpkg --list |grep "^rc" | cut -d " " -f 3 | xargs sudo dpkg --purge
RUN apt-get clean

