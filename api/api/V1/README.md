# Anatomy of an API request

This is an overview of how our api requests are structured, and some dos and don'ts for writing new API endpoints.

All intermediate results from the database or other processing get added into the `response.locals` object, which exists in express for this purpose.
We avoid mutating the request object with our working objects, since request validation happens asynchronously in parallel inside of `express-validator`,
and are not guaranteed to complete in any particular order.

### Example: getting a device by id
```
/**
* APIDOC stuff goes here:
* @apiInterface {apiBody::TsDefinedInterface} // 1. Automated API docs
* /
app.get(
    `${apiUrl}/device/:deviceId`, // 2. Endpoint
    extractJwtAuthorizedUser, // 3. Extract credentials from JWT token
    validateFields([ // 4. Request field validation.
      idOf(param("deviceId")),
      query("view-mode").optional().equals("user"),
      query("only-active").optional().isBoolean().toBoolean(),
    ]),
    fetchAuthorizedRequiredDeviceById(param("deviceId")), // 5. Acquire required resources
    async (request: Request, response: Response) => {
      // 6. Logic specific to this request.
       
      return responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        device
      });
    }
);
```
### 1. ApiDoc typescript integration
ApiDoc works as described [here](https://apidocjs.com/#getting-started) with one addition enabled by a plugin
To keep complex structures up to date with our TypeScript interface definitions, use `@apiInterface` followed by `{api(location)::ApiInterfaceDefinition}`
`ApiInterfaceDefinition` needs to be imported in scope in the current file for this to work. `location` corresponds to `Body`, `Query`, etc. 

### 2. Endpoint - nothing special here, just regular Express router rules.

### 3. Extract credentials.
Before anything else, we need to decode the JWT, making sure it's the 'type' we want - _user_, _device_, or something else.
This step doesn't hit the database, and if successful we get a sort of proxy object attached to `response.locals` using the key format `request${Objectname}`,
so the authorised requesting user is stored in `response.locals.requestUser`, or in the case it's a device making the request `response.locals.requestDevice`.
It's important to note that this is just an object storing the entity `id` i.e. `response.locals.requestUser.id` - since that is all that is needed for most
requests.  If you need an actual `User` model object, you will need to obtain it manually using the `id`.

### 4. Request field validation
A developer looking at this request should be able to immediately see what the names of allowed fields are, and where they come from in the request.
For instance `param("deviceId")` tells us that there is a mandatory url parameter in the `:deviceId` slot.
`query("view-mode").optional().equals('user')` tells us there is an optional url query param called `view-mode` which can have a value of `user` if set.
Other possible locations for request fields are `body(..)`, `header(..)`.

Anything *not* specified in the `validateFields([..])` array will be rejected during the validation phase, with an appropriate error message about the illegal fields, or any missing required fields.

Note that the validation step is only intended to check that the request is *well-formed* - it should not invoke any calls to the database or do any kind of resource auth/permissions checking, so that failures due to badly formed requests are fast and exit early.

### 5. Acquire required resources

One or more middleware functions defining the individual resources required to fulfil the request.
This is where any permission checking that requires hitting the database should take place.
Resources (models) are added to `response.locals` in the format `${modelname(s)}` depending on whether it's a single resource being returned, or an array.
Middleware functions are in the format `fetch(AdminAuthorized|Authorized|Unauthorized)(Required|Optional)(resourceName(s))By(Name|Id|NameOrId)`.
If `Authorized`, the calling user/device must have permissions to view the resource, usually via device or group membership.
If `AdminAuthorized`, the calling/device must have admin permissions for the resource, via admin device or admin group membership.
If `Unauthorized`, no permissions checking is performed when acquiring the resource.

If `Required`, and acquiring the resource fails, the request will return a `403 forbidden` error.
If `Optional`, and acquiring the resource fails, the request will carry on.  This is usually accompanied by some logic where one of two or more possible resources is required, but the logic for enforcing that happens one-off in a subsequent middleware function.

### 6. Logic specific to this request
This is an implementation detail for the developer, however, if calling into the model layer, ensure that you don't pass the request or response objects into that layer.
Instead, pull out the variables you need to perform your logic from the `response.locals` object first.

Secondly, don't throw errors within the model layer expecting them to be caught by the request handler.  This makes it difficult to reuse that model logic in other contexts.
Prefer returning, and handling the error inside the request handler body, so that it is explicit to the reader.
