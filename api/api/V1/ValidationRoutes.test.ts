import type { Application, NextFunction, Request, Response } from "express";
import { validateFields } from "@api/middleware.js";
import {
  allOrNoneOf,
  atLeastOneOf,
  atMostOneOf,
  deprecatedField,
  emailOf,
  exactlyOneOf,
  exactlyOneOfOrDefault,
  idOf,
  nameOf,
  validNameOf,
} from "@api/validation-middleware.js";
import { query } from "express-validator";
import { successResponse } from "@api/V1/responseUtil.js";

export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/test`;

  app.get(
    `${apiUrl}/exactly-one-of`,
    validateFields([
      exactlyOneOf(
        validNameOf(query("a")),
        validNameOf(query("b")),
        validNameOf(query("e")),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Created new user.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/at-most-one-of`,
    validateFields([
      atMostOneOf(
        validNameOf(query("a")),
        validNameOf(query("b")),
        validNameOf(query("e")),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Created new user.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/nested-at-least-one`,
    validateFields([
      atLeastOneOf(
        atLeastOneOf(
          validNameOf(query("a")),
          validNameOf(query("b")),
          validNameOf(query("e")),
        ),
        query("c").exists(),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/nested-exactly-one-of`,
    validateFields([
      exactlyOneOf(
        atMostOneOf(validNameOf(query("a")), validNameOf(query("b"))),
        atMostOneOf(validNameOf(query("c")), validNameOf(query("d"))),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/complex-nesting`,
    validateFields([
      exactlyOneOf(
        atMostOneOf(
          deprecatedField(validNameOf(query("a"))).optional(),
          validNameOf(query("A")).optional(),
        ),
        allOrNoneOf(
          atMostOneOf(
            deprecatedField(validNameOf(query("b"))).optional(),
            validNameOf(query("B")).optional(),
          ),
          atMostOneOf(
            deprecatedField(validNameOf(query("c"))).optional(),
            validNameOf(query("C")).optional(),
          ),
        ),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/exactly-one-of-or-default`,
    validateFields([
      exactlyOneOfOrDefault(false)(
        query("a").optional().isBoolean().toBoolean(),
        deprecatedField(query("A")).optional().isBoolean().toBoolean(),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/exactly-one-of-conditions`,
    validateFields([exactlyOneOf(nameOf(query("a")), idOf(query("A")))]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/exactly-one-of-same-location`,
    validateFields([exactlyOneOf(emailOf(query("a")), idOf(query("a")))]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );

  app.get(
    `${apiUrl}/at-least-one-of`,
    validateFields([
      atLeastOneOf(
        validNameOf(query("a")),
        query("b").optional().isBoolean().toBoolean(), // All of these are effectively "optional"?
        query("e"), // Should really enforce "exists"?
        query("c").exists(),
      ),
    ]),
    (request: Request, response: Response, _next: NextFunction) => {
      return successResponse(response, "Success.", {
        ...request.query,
      });
    },
  );
};
