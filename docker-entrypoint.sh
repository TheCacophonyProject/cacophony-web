#!/bin/bash
set -e

cd /

echo "---- Syncing time ----"
#timedatectl set-ntp on
#timedatectl

echo "---- Starting Minio ----"
./minio server --address :9001 .data &> minio.log &


echo "---- Starting PostgreSQL ----"
service postgresql start


sudo -i -u postgres psql -c "CREATE USER test with password 'test'"
sudo -i -u postgres psql -c "CREATE DATABASE cacophonytest WITH OWNER test;"
sudo -i -u postgres psql cacophonytest -c "CREATE EXTENSION postgis"
sudo -i -u postgres psql cacophonytest -c "CREATE EXTENSION citext"

echo "---- Setting up Minio ----"
./mc config host add myminio http://127.0.0.1:9001 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
./mc mb myminio/cacophony
./mc mb myminio/cacophony-archived

cd /app/api

CONFIG=config/app.js
if [ ! -f "$CONFIG" ]; then
  CONFIG=config/app_test_default.js
fi
echo "---- Using config $CONFIG ----"

../node_modules/.bin/sequelize db:migrate --config $CONFIG
sudo -i -u postgres psql cacophonytest -f /app/api/test/db-seed.sql

echo "alias psqltest='sudo -i -u postgres psql cacophonytest'" > ~/.bashrc

echo "---- update npm packages ----"
npm i

echo "---- Compiling JSON schemas ----"
cd ../types && npm run generate-schemas
cd ../api

echo "---- Compiling typescript and starting module ----"
../node_modules/.bin/tsc --resolveJsonModule
../node_modules/.bin/tsc-watch --resolveJsonModule --noClear --onSuccess "node --no-warnings=ExperimentalWarnings --experimental-json-modules Server.js --config=$CONFIG"
