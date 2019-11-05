#!/usr/bin/env node

const fs = require('fs-extra');
const chalk = require('chalk');
const path = require('path');
const {spawnSync} = require('child_process');
const os = require("os");
var inquirer = require('inquirer');

const extraArgs = process.argv.splice(2);

const rootFolder = path.resolve(__dirname, '../');
const packageJsonPath = path.resolve(rootFolder, 'package.json');
const binPath = path.resolve(rootFolder, 'node_modules', '.bin');



function runSpawn(command, args, extra = {}) {
  const stdio = typeof extra.stdio === 'string' ? [extra.stdio,extra.stdio, 'pipe'] :
    Array.isArray(extra.stdio) && extra.stdio.length === 3 ? [extra.stdio[0], extra.stdio[1], 'pipe'] : 'inherit' // 'pipe'
  const result = spawnSync(command, args, { ...extra, stdio});

  if (result.status === null || result.status !== 0) {
    throw new Error(result.stderr || 'general error');
  }

  return result;
}

function showSummary() {
  const version = getPluginVersion();
  const tagName = `v${version}`;

  console.log(chalk`
    {green Successfully created new plugin version}
     
    Version :${version}
  
    Before committing please test version.  
      
    To abort changes run:
    {bold git reset --hard}
    
    To commit changes to github run:
    {bold git commit -am "chore(release): publish version ${version}"}
    {bold git tag -a ${tagName} -m "${tagName}"}
    {bold git push --follow-tags}  
    
    Then, publish to npm:
    {bold npm run deploy:publish-to-npm}
  `);
}


async function promptWelcome() {
  console.log(chalk`{bgCyan {bold Welcome!}}
This script will prepare the next plugin version.
`);
  const {ready} = await inquirer.prompt(
    [{
      name: 'ready',
      type: 'confirm',
      message: 'Are you ready to begin?'
    }]
  );

  if (!ready) {
    console.log('See you next time....');
  }

  return ready;
}

function getPluginVersion() {
  const playerPackageJson = fs.readJsonSync(packageJsonPath);
  return playerPackageJson['version'];
}

(async function() {
  try {

    if (!await promptWelcome()) {
      return;
    }

    console.log(chalk.blue(`delete dist folder`));
    runSpawn('npm', ['run','clean'], { cwd: rootFolder});
    console.log(chalk.blue(`re-install dependencies in CI mode`));
    runSpawn('npm', ['ci'], { cwd: rootFolder});
    console.log(chalk.blue(`build code`));
    runSpawn('npm', ['build'], { cwd: rootFolder});
    console.log(chalk.blue(`run standard version`));
    runSpawn('npm', ['publish', '--access', 'public',extraArgs], { cwd: rootFolder});

    showSummary();
  } catch (err) {
    console.error(err);
  }
})();


