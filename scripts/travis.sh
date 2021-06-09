#!/bin/sh
# https://docs.travis-ci.com/user/customizing-the-build/#Implementing-Complex-Build-Steps
set -ev
CI=false
npm install
npm run release-canary
exit 0
if [ "${TRAVIS_MODE}" = "release" ] || [ "${TRAVIS_MODE}" = "releaseCanary" ]; then
  if [ "${TRAVIS_MODE}" = "releaseCanary" ]; then
    echo "Run standard-version"
    npm run release-canary
    sha=$(git rev-parse --verify --short HEAD)
    echo "Current sha ${sha}"
    commitNumberAfterTag=$(git rev-list  `git rev-list --tags --no-walk --max-count=1`..HEAD --count)
    echo "Number of commit from last tag ${commitNumberAfterTag}"
    currentVersion=$(npx -c 'echo "$npm_package_version"')
    echo "Current version ${currentVersion}"
    newVersion=$(echo $currentVersion | sed -e "s/canary\.[[:digit:]]/canary.${commitNumberAfterTag}-${sha}/g")
    echo "New version ${newVersion}"
    sed -iE "s/$currentVersion/$newVersion/g" package-lock.json
    sed -iE "s/$currentVersion/$newVersion/g" package.json
    sed -iE "s/$currentVersion/$newVersion/g" CHANGELOG.md
    rm package-lock.jsonE
    rm package.jsonE
    rm CHANGELOG.mdE
  else
    echo "Run conventional-github-releaser"
    #ignore error to make sure release won't get stuck
    conventional-github-releaser -p angular -t $GH_TOKEN || true
  fi
  echo "Building..."
  npm run build
  echo "Finish building"
elif [ "${TRAVIS_MODE}" = "deploy" ]; then
  echo "Deploy..."
elif [ "${TRAVIS_MODE}" = "tests" ]; then
    echo "Run standard-version"
    standard-version --prerelease canary --skip.commit=true --skip.tag=true
    sha=$(git rev-parse --verify --short HEAD)
    echo "Current sha ${sha}"
    commitNumberAfterTag=$(git rev-list  `git rev-list --tags --no-walk --max-count=1`..HEAD --count)
    echo "Number of commit from last tag ${commitNumberAfterTag}"
    currentVersion=$(npx -c 'echo "$npm_package_version"')
    echo "Current version ${currentVersion}"
    newVersion=$(echo $currentVersion | sed -e "s/canary\.[[:digit:]]/canary.${commitNumberAfterTag}-${sha}/g")
    echo "New version ${newVersion}"
    sed -iE "s/$currentVersion/$newVersion/g" package-lock.json
    sed -iE "s/$currentVersion/$newVersion/g" package.json
    sed -iE "s/$currentVersion/$newVersion/g" CHANGELOG.md
    rm package-lock.jsonE
    rm package.jsonE
    rm CHANGELOG.mdE
else
	echo "Unknown travis mode: ${TRAVIS_MODE}" 1>&2
	exit 1
fi
