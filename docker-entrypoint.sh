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


# Check if postgres user test is created
if ! sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='test'" | grep -q 1; then
    echo "---- Creating PostgreSQL user test ----"
    sudo -i -u postgres psql -c "CREATE USER test with password 'test'"
    sudo -i -u postgres psql -c "CREATE DATABASE cacophonytest WITH OWNER test;"
fi

sudo -i -u postgres psql cacophonytest -c "CREATE EXTENSION IF NOT EXISTS postgis"
sudo -i -u postgres psql cacophonytest -c "CREATE EXTENSION IF NOT EXISTS citext"
sudo -i -u postgres psql cacophonytest -c "CREATE EXTENSION IF NOT EXISTS ltree"


echo "---- Setting up Minio ----"
# Check minio has been setup by checking if myminio/cacophony exists
if ./mc ls myminio | grep -q cacophony; then
    echo "---- Minio already setup ----"
else
    echo "---- Setting up Minio ----"
    ./mc config host add myminio http://127.0.0.1:9001 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
    ./mc mb myminio/cacophony
    ./mc mb myminio/cacophony-archived
fi

cd /app/api

CONFIG=/app/api/config/app.js
if [ ! -f "$CONFIG" ]; then
  cp /app/api/config/app_test_default.js $CONFIG
  echo "---- Copying /app/api/config/app_test_default.js to $CONFIG ----"
fi


echo "---- install npm packages ----"

npm install --omit=optional
mv ../bcrypt ./node_modules/
mv ../sharp ./node_modules/

# Sharp dependencies
if [ ! -d "./node_modules/detect-libc" ]; then
  mv ../detect-libc ./node_modules/
fi
mv ../color ./node_modules/
cd ../types && npm install
cd ../api

echo "---- Using config $CONFIG ----"

./node_modules/.bin/sequelize db:migrate --config $CONFIG --env "database"
sudo -i -u postgres psql cacophonytest -f /app/api/db-seed.sql
echo "alias psqltest='sudo -i -u postgres psql cacophonytest'" > ~/.bashrc

echo "---- Compiling JSON schemas ----"
cd ../types && npm run generate-schemas
cd ../api

echo "---- Compiling typescript and starting module ----"
./node_modules/.bin/tsc
#sleep 10000
chmod a+x ./node_modules/.bin/tsc-watch
./node_modules/.bin/tsc-watch --noClear --onSuccess "node --loader esm-module-alias/loader --no-warnings=ExperimentalWarnings --inspect=0.0.0.0:9229 ./Server.js --config=$CONFIG"
