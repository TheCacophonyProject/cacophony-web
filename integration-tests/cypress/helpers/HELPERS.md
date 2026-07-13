# Non-Cypress Test framework helpers.

## Background
Cacophony legacy API end-to-end tests are based around `cy.request` to make HTTP requests 
to the Cacophony API.

Cypress uses a 'Promise-like' API for handling asynchronous operations, which doesn't allow implementors
to use standard `async/await` syntax for handling asynchronous operations.

This encourages the use of callback functions or `.then()` chains to sequence tests, resulting in massively 
indented code blocks, making the code overly verbose and harder to read.
It also meant that tests were using their own implementation of a client API wrapper, 
which makes tests more difficult to maintain when the API changes.

To address these issues, a shared client API wrapper was created to provide a consistent 
interface for interacting with the API across tests and the actual web client.

## Test helpers

This folder contains various helper functions and utilities that are used to simplify the process of writing and 
maintaining new style Cacophony API end-to-end tests.
