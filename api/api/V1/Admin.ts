/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { validateFields } from "../middleware";
import { successResponse } from "./responseUtil";
import { body, param } from "express-validator";
import { Application, NextFunction, Request, Response } from "express";
import {
  extractJwtAuthorisedSuperAdminUser, fetchUnauthorizedRequiredUserByEmailOrId,
} from "@api/extract-middleware";
import {anyOf, idOf } from "@api/validation-middleware";
import { ClientError } from "@api/customErrors";
import { HttpStatusCode, UserGlobalPermission } from "@typedefs/api/consts";
import { SuperUsers } from "@/Globals";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ApiUpdateGlobalPermissionRequestBody {
  permission: UserGlobalPermission; // Permission to apply for user
}
export default function (app: Application, baseUrl: string) {
  const apiUrl = `${baseUrl}/admin`;

  {
    /**
     * @api {patch} /api/v1/admin/global-permission/:userEmailOrId Update user global permissions
     * @apiUse V1UserAuthorizationHeader
     * @apiName UpdateGlobalPermission
     * @apiGroup Admin
     * @apiParam {String|Number} userEmailOrId email or id of user to update
     * @apiInterface {apiBody::ApiUpdateGlobalPermissionRequestBody}
     * @apiUse V1ResponseSuccess
     * @apiUse V1ResponseError
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    app.patch(
      `${apiUrl}/global-permission/:userEmailOrId`,
      extractJwtAuthorisedSuperAdminUser,
      validateFields([
        anyOf(param("userEmailOrId").isEmail(), idOf(param("userEmailOrId"))),
        body("permission").isIn(Object.values(UserGlobalPermission)),
      ]),
      (request: Request, response: Response, next: NextFunction) => {
        if (!response.locals.requestUser.hasGlobalWrite()) {
          return next(
            new ClientError(
              "Super admin user must have globalWrite permissions",
              HttpStatusCode.Forbidden
            )
          );
        }
        next();
      },
      fetchUnauthorizedRequiredUserByEmailOrId(param("userEmailOrId")),
      async (request, response) => {
        const permission: UserGlobalPermission = request.body.permission;
        const userToUpdate = response.locals.user;
        response.locals.user.globalPermission = permission;
        await userToUpdate.save();

        // Update global super admin cache:
        if (
          [UserGlobalPermission.Write, UserGlobalPermission.Read].includes(
            permission
          )
        ) {
          SuperUsers.set(userToUpdate.id, userToUpdate.globalPermission);
        } else {
          SuperUsers.delete(userToUpdate.id);
        }
        return successResponse(response, "Users global permission updated.");
      }
    );
  }
}
