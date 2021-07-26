# Cypress api and browse tests

Project | integration-tests
---|--- |
Platform | Ubuntu (Linux) |
Requires | A running [`cacophony-api`](https://github.com/TheCacophonyProject/cacophony-api) server </br> A running [`cacophony-browse`](https://github.com/TheCacophonyProject/cacophony-browse) server 
Build (Test) Status | [![Build Status](https://api.travis-ci.com/TheCacophonyProject/integration-tests.svg?branch=master)](https://travis-ci.com/TheCacophonyProject/integration-tests) |
Full test | [Cypress test results](https://dashboard.cypress.io/projects/dyez6t/runs)|
Licence | GNU General Public License v3.0 |

## Instructions
By default the tests run against our test server interface.

To run the tests against browse-test/api-test go to [Integration tests on Travis](https://travis-ci.com/TheCacophonyProject/integration-tests) and click _Restart build_

## Development Instructions
By default the tests run against our test server interface but you can run the tests on your own machine. 

## To run the tests on your own machine
1.  Go to the test-cypress folder
2.  Copy cypress.json.TEMPLATE to cypress.json.
3.  In cypress.json change the server address
4.  For browser and performance tests, repeat for cypress-browse.json and cypress-performance.json
5.  Run (api, browser and performance tests)
``` bash
npm install
npm run dev
npm run browse
npm run performance
```
5.  Look for the [cypress](https://www.cypress.io/) interactive environment.

# More information

Before you write your own tests please read the following:

[Test architecture](/test-cypress/architecture.md)

## Test with the fake-thermal-camera.   
Some of these tests used to exercise the fake thermal camera to check videos would record and upload.   It would be good to get this working in the future. 

## Lint
Before committing changes run eslint to check style
``` bashin
npm run lint
```
