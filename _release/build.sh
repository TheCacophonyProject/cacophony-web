#!/bin/bash

fatal() {
    echo "$1"
    exit 1
}

version=${1/v/}
if [[ "$version" == "" ]]; then
    fatal "usage: $0 <version>"
fi

which json || fatal "Please install the json tool ('npm install -g json')"

set -e

# Start from the root of the repo
root=`git rev-parse --show-toplevel`
cd $root

echo "Setting up build directory..."
build_dir=${root}/dist/build
rm -rf ${build_dir}
mkdir -p ${build_dir}

echo "Extracting source tree..."
git archive HEAD | tar -x -C ${build_dir}
cp _release/* ${build_dir}/_release  # makes things easier while developing release process

cd ${build_dir}

echo "Building Cacophony Browse-Next"
cd browse-next
npm version --no-git-tag-version ${version}
rm -rf node_modules
npm install
# We error on this, to move it temporarily.
mv ../types/.eslintrc.js ../types/.eslintrc.js.tmp
npm run build
rm -rf node_modules

echo "Installing shared type definitions"
cd ../types
# Move eslint file back.
mv .eslintrc.js.tmp .eslintrc.js
rm -rf node_modules
npm install
echo "Compiling TypeScript..."
./node_modules/.bin/tsc
npm run generate-schemas

cd ..

echo "Installing dependencies for build..."
cd api

rm -rf node_modules
npm install

echo "Compiling TypeScript..."
./node_modules/.bin/tsc

echo "Creating API docs..."
npm update apidoc-plugin-ts
npm run apidoc

echo "Removing external dependencies..."
rm -rf node_modules

echo "Removing TypeScript files..."
find -name '*.ts' -print0 | xargs -0 rm


# BROWSE: Update files which need the right version number, build the packed
# release
echo "Building Cacophony Browse"
cd ../browse
npm version --no-git-tag-version ${version}
rm -rf node_modules
npm install
npm run release
rm -rf node_modules

cd ../types
echo "Removing typedefs external dependencies..."
rm -rf node_modules
echo "Removing typedefs TypeScript files..."
find -name '*.ts' -print0 | xargs -0 rm

cd ..

# cron doesn't like it when cron.d files are writeable by anyone other than the
# owner.
echo "Fixing perms..."
chmod 644 _release/{cacophony-api-influx-metrics,cacophony-api-prune-objects,cacophony-api-remove-dups,cacophony-api-report-stopped-devices,cacophony-api-report-errors,cacophony-api-archive-objects}

echo "Setting versions..."
perl -pi -e "s/^version:.+/version: \"${version}\"/" _release/nfpm.yaml

json -I -f api/package.json -e "this.version=\"${version}\""
json -I -f api/package-lock.json -e "this.version=\"${version}\""

nfpm -f _release/nfpm.yaml pkg -t ../cacophony-web_${version}.deb
