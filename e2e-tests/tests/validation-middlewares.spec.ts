import { test } from "@/helpers/upload-tests";
import { expect } from "@playwright/test";

const TEST_VALIDATORS_URL = "http://localhost:1080/api/v1/test";

test("atLeastOneOf validation middleware", async () => {
  await test.step("atLeastOneOf fails if no params passed", async () => {
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected at least one of query.a, query.b, query.c, query.e.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.a: Expected string, got undefined",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Expected string of minimum length 3, got length of 0.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "Invalid value",
              path: "c",
              location: "query",
            },
          ],
        },
      ],
      messages: ["Expected at least one of query.a, query.b, query.c, query.e."],
    });
  });

  await test.step("atLeastOneOf fails if unknown params passed", async () => {
    const params = new URLSearchParams();
    params.append("foo", "bar");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "unknown_fields",
          msg: "Unknown fields found: 'query.foo'",
          fields: [
            {
              path: "foo",
              location: "query",
              value: "bar",
            },
          ],
        },
        {
          type: "alternative",
          msg: "Expected at least one of query.a, query.b, query.c, query.e.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.a: Expected string, got undefined",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Expected string of minimum length 3, got length of 0.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "Invalid value",
              path: "c",
              location: "query",
            },
          ],
        },
      ],
      messages: [
        "Unknown fields found: 'query.foo'",
        "Expected at least one of query.a, query.b, query.c, query.e.",
      ],
    });
  });
  await test.step("atLeastOneOf fails if unknown params passed, and if the param is similar to another, provides a suggested fix", async () => {
    const params = new URLSearchParams();
    params.append("aa", "bar");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "unknown_fields",
          msg: "Unknown fields found: 'query.aa' - did you mean 'query.a'?",
          fields: [
            {
              path: "aa",
              location: "query",
              value: "bar",
            },
          ],
        },
        {
          type: "alternative",
          msg: "Expected at least one of query.a, query.b, query.c, query.e.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.a: Expected string, got undefined",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Expected string of minimum length 3, got length of 0.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "Invalid value",
              path: "c",
              location: "query",
            },
          ],
        },
      ],
      messages: [
        "Unknown fields found: 'query.aa' - did you mean 'query.a'?",
        "Expected at least one of query.a, query.b, query.c, query.e.",
      ],
    });
  });
  await test.step("atLeastOneOf fails if correct param passed that fails its own validator", async () => {
    const params = new URLSearchParams();
    params.append("a", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "1",
          msg: "query.a: Expected string of minimum length 3, got length of 1.",
          path: "a",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "a",
          location: "query",
        },
      ],
      messages: [
        "query.a: Expected string of minimum length 3, got length of 1.",
        "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });
  await test.step("atLeastOneOf fails if correct param passed that fails its own validator, and another that passes its own validator", async () => {
    const params = new URLSearchParams();
    // Fails because `a` fails
    params.append("a", "1");
    params.append("c", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      messages: [
        "query.a: Expected string of minimum length 3, got length of 1.",
        "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });
  await test.step("atLeastOneOf preserves mutations", async () => {
    const params = new URLSearchParams();
    params.append("b", "true");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      b: true,
    });
  });
  await test.step("atLeastOneOf succeeds if at least one field passes and none error that had data supplied", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-least-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: "foobar12",
    });
  });
});

test("exactlyOneOf validation middleware", async () => {
  await test.step("exactlyOneOf fails if no params passed", async () => {
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected exactly one of query.a, query.b, query.e.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.a: Expected string, got undefined",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Expected string of minimum length 3, got length of 0.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.b: Expected string, got undefined",
              path: "b",
              location: "query",
            },
            {
              type: "field",
              msg: "query.b: Expected string of minimum length 3, got length of 0.",
              path: "b",
              location: "query",
            },
            {
              type: "field",
              msg: "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "b",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Expected string, got undefined",
              path: "e",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Expected string of minimum length 3, got length of 0.",
              path: "e",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "e",
              location: "query",
            },
          ],
        },
      ],
      messages: ["Expected exactly one of query.a, query.b, query.e."],
    });
  });
  await test.step("exactlyOneOf fails if more than one valid param is passed", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    params.append("b", "foobar13");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected exactly one of query.a, query.b, query.e.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.e: Expected string, got undefined",
              path: "e",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Expected string of minimum length 3, got length of 0.",
              path: "e",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "e",
              location: "query",
            },
          ],
        },
      ],
      messages: ["Expected exactly one of query.a, query.b, query.e."],
    });
  });

  await test.step("exactlyOneOf fails if more than one valid and one invalid param is passed", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    params.append("b", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "1",
          msg: "query.b: Expected string of minimum length 3, got length of 1.",
          path: "b",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "b",
          location: "query",
        },
      ],
      messages: [
        "query.b: Expected string of minimum length 3, got length of 1.",
        "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });

  await test.step("exactlyOneOf passes with a single valid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: "foobar12",
    });
  });
});

test("Nested exactlyOneOf validation middleware", async () => {
  await test.step("nested exactlyOneOf fails with no params", async () => {
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  await test.step("nested exactlyOneOf fails with one invalid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "1",
          msg: "query.a: Expected string of minimum length 3, got length of 1.",
          path: "a",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "a",
          location: "query",
        },
      ],
      messages: [
        "query.a: Expected string of minimum length 3, got length of 1.",
        "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });

  await test.step("nested exactlyOneOf fails with two invalid params in the same group", async () => {
    const params = new URLSearchParams();
    params.append("a", "1");
    params.append("b", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "1",
          msg: "query.a: Expected string of minimum length 3, got length of 1.",
          path: "a",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "a",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.b: Expected string of minimum length 3, got length of 1.",
          path: "b",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "b",
          location: "query",
        },
      ],
      messages: [
        "query.a: Expected string of minimum length 3, got length of 1.",
        "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
        "query.b: Expected string of minimum length 3, got length of 1.",
        "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });

  await test.step("nested exactlyOneOf fails with one invalid param in the first group and one valid in the second", async () => {
    const params = new URLSearchParams();
    params.append("a", "1");
    params.append("c", "foobar31");
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "1",
          msg: "query.a: Expected string of minimum length 3, got length of 1.",
          path: "a",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "a",
          location: "query",
        },
      ],
      messages: [
        "query.a: Expected string of minimum length 3, got length of 1.",
        "query.a: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });

  await test.step("nested exactlyOneOf succeeds with one valid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  await test.step("nested exactlyOneOf fails with two valid params in the same nested group", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    params.append("b", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  await test.step("nested exactlyOneOf fails with one valid param from each nested group", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    params.append("c", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/nested-exactly-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected exactly one of query.a, query.b, query.c, query.d.",
          nestedErrors: [],
        },
      ],
      messages: ["Expected exactly one of query.a, query.b, query.c, query.d."],
    });
  });
});

test("Complex nesting", async () => {
  /*
    validateFields([
      exactlyOneOf(
        atMostOneOf(
          deprecatedField(validNameOf(query("a"))).optional(),
          validNameOf(query("A")).optional(),
        ), // Either one of these
        allOf(
          atMostOneOf(
            deprecatedField(validNameOf(query("b"))).optional(),
            validNameOf(query("B")).optional(),
          ),
          atMostOneOf(
            deprecatedField(validNameOf(query("c"))).optional(),
            validNameOf(body("C")).optional(),
          ),
        ), // Or one each of these
      ),
    ]),
     */
  await test.step("first clause/group succeeds with one valid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/complex-nesting?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  await test.step("second clause/group succeeds with one valid param in each sub-group", async () => {
    const params = new URLSearchParams();
    params.append("b", "foobar12");
    params.append("c", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/complex-nesting?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  await test.step("fails with valid params in each sub-group", async () => {
    const params = new URLSearchParams();
    params.append("b", "foobar12");
    params.append("c", "foobar12");
    params.append("a", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/complex-nesting?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    // FIXME: Message should reflect groupings
    expect(json).toMatchObject({
      messages: [
        "Expected exactly one of (query.a | query.A) | ((query.b | query.B), (query.c | query.C)).",
      ],
    });
  });
});

test("exactlyOneOfOrDefault validation middleware", async () => {
  await test.step("exactlyOneOfOrDefault succeeds if no params passed", async () => {
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-or-default?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: false,
    });
  });

  await test.step("exactlyOneOfOrDefault succeeds with single valid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "true");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-or-default?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: true,
    });
  });

  await test.step("exactlyOneOfOrDefault succeeds with single valid param which is the same as the default value", async () => {
    const params = new URLSearchParams();
    params.append("a", "false");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-or-default?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: false,
    });
  });

  await test.step("exactlyOneOfOrDefault fails with two valid params", async () => {
    const params = new URLSearchParams();
    params.append("a", "true");
    params.append("A", "true");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-or-default?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected exactly one of query.a, query.A.",
          nestedErrors: [],
        },
      ],
      messages: ["Expected exactly one of query.a, query.A."],
    });
  });

  await test.step("exactlyOneOfOrDefault fails with one invalid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-or-default?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "foobar",
          msg: "Invalid value",
          path: "a",
          location: "query",
        },
      ],
      messages: ["Invalid value"],
    });
  });
});

test("exactlyOneOf item conditions", async () => {
  await test.step("fails if no params passed", async () => {
    // This is really just testing the idOf validator
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-conditions?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected exactly one of query.a, query.A.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.a: Expected string, got undefined",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.A: Expected integer, got undefined",
              path: "A",
              location: "query",
            },
          ],
        },
      ],
      messages: ["Expected exactly one of query.a, query.A."],
    });
  });
});

test("exactlyOneOf all checks refer to the same location", async () => {
  await test.step("fails if no params passed", async () => {
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-same-location?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected exactly one of query.a, query.a.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.a: Expected integer, got undefined",
              path: "a",
              location: "query",
            },
            {
              type: "field",
              msg: "query.a: Expected email address, got 'undefined'",
              path: "a",
              location: "query",
            },
          ],
        },
      ],
      messages: ["Expected exactly one of query.a, query.a."],
    });
  });
  await test.step("succeeds if email passed", async () => {
    const params = new URLSearchParams();
    params.append("a", "test@gmail.com");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-same-location?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: "test@gmail.com",
    });
  });

  await test.step("succeeds if id passed", async () => {
    const params = new URLSearchParams();
    params.append("a", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/exactly-one-of-same-location?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: 1,
    });
  });
});

test("atMostOneOf validation middleware", async () => {
  await test.step("atMostOneOf succeeds if no params passed", async () => {
    const params = new URLSearchParams();
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-most-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
  });
  await test.step("atMostOneOf succeeds if one valid param is passed", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-most-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json).toMatchObject({
      a: "foobar12",
    });
  });

  await test.step("atMostOneOf fails if more than one valid and one invalid param is passed", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    params.append("b", "1");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-most-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "field",
          value: "1",
          msg: "query.b: Expected string of minimum length 3, got length of 1.",
          path: "b",
          location: "query",
        },
        {
          type: "field",
          value: "1",
          msg: "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
          path: "b",
          location: "query",
        },
      ],
      messages: [
        "query.b: Expected string of minimum length 3, got length of 1.",
        "query.b: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
      ],
    });
  });

  await test.step("atMostOneOf fails with more than one valid param", async () => {
    const params = new URLSearchParams();
    params.append("a", "foobar12");
    params.append("b", "foobar12");
    const response = await fetch(`${TEST_VALIDATORS_URL}/at-most-one-of?${params}`);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json).toMatchObject({
      errors: [
        {
          type: "alternative",
          msg: "Expected at most one of query.a, query.b, query.e.",
          nestedErrors: [
            {
              type: "field",
              msg: "query.e: Expected string, got undefined",
              path: "e",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Expected string of minimum length 3, got length of 0.",
              path: "e",
              location: "query",
            },
            {
              type: "field",
              msg: "query.e: Must only contain letters, numbers, dash, underscore and space. Must contain at least one letter.",
              path: "e",
              location: "query",
            },
          ],
        },
      ],
      messages: ["Expected at most one of query.a, query.b, query.e."],
    });
  });
});
