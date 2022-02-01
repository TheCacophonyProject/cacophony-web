/**
 * @apiDefine V1ResponseSuccess
 * @apiSuccess {Boolean} success `true` - Request was successful.
 * @apiSuccess {String[]} messages Messages about the request.
 */

/**
 * @apiDefine V1ResponseError
 * @apiError {Boolean} success `false` - Request failed.
 * @apiError {String[]} messages Messages about the error.
 */

/**
 * @apiDefine V1UserAuthorizationHeader
 * @apiHeader {String} Authorization Signed JSON web token for a user.
 */

/**
 * @apiDefine V1DeviceAuthorizationHeader
 * @apiHeader {String} Authorization Signed JSON web token for a device.
 */

/**
 * @apiDefine BaseQueryParams
 * @apiQuery {JSON} [where] Selection criteria as a map of keys and required value, or a list of possible values.
 * * For example {"device": 1}  or {"name": ["bob", "charles"]}.
 * * All matches must be exact.
 * * Records must match all criteria.
 * * Use a '.' to join keys embedded in other keys.  For example, use {"details.name": "sample"}
 * to match { "details": {"name": "sample"}}.  Note: Only some embedded keys will work.
 * @apiQuery {Number} [offset] Zero-based page number. Use '0' to get the first page.  Each page has 'limit' number of records.
 * @apiQuery {Number} [limit] Max number of records to be returned.
 */

/**
 * @apiDefine DevicesList
 * @apiSuccessExample {JSON} devices:
 * [{
 * "deviceName": "device name",
 *  "groupName": "group name",
 *  "groupId": 1,
 *  "deviceId: 2,
 *  "saltId": 2,
 *  "active": true,
 *  "admin": false,
 *  "type": "thermal",
 *  "public": "false",
 *  "lastConnectionTime": "2021-11-09T01:38:22.079Z",
 *  "lastRecordingTime": "2021-11-07T01:38:48.400Z",
 *  "location": {
 *   "lat": -43.5338812,
 *    "lng": 172.6451473
 *  },
 *  "users": [{
 *    "userName": "bob",
 *    "userId": 10,
 *    "admin": false,
 *    "relation": "group"
 *  }]
 * }]
 */

/**
 * @apiDefine RecordingOrder
 * @apiParam {JSON} [order] Sorting order for records.
 * * For example, ["recordingDateTime"] or [["recordingDateTime", "ASC"]].
 */

/**
 * @apiDefine MoreQueryParams
 * @apiQuery {JSON} [tags] Only return recordings tagged with one or more of the listed tags (JSON array).
 * @apiQuery {String} [tagMode] Only return recordings with specific types of tags. Valid values:
 * <ul>
 * <li>any: match recordings with any (or no) tag
 * <li>untagged: match only recordings with no tags
 * <li>tagged: match only recordings which have been tagged
 * <li>no-human: match only recordings which are untagged or have been automatically tagged
 * <li>automatic-only: match only recordings which have been automatically tagged
 * <li>human-only: match only recordings which have been manually tagged
 * <li>automatic+human: match only recordings which have been both automatically & manually tagged
 * </ul>
 */

/**
 * @apiDefine V1ResponseSuccessQuery
 * @apiSuccess {Boolean} success `true` - Request was successful.
 * @apiSuccess {String[]} messages Messages about the request.
 * @apiSuccess {Number} offset Mirrors request offset parameter.
 * @apiSuccess {Number} limit Mirrors request limit parameter.
 * @apiSuccess {Number} count Total number of records which match the query.
 * @apiSuccess {JSON} rows List of details for records which matched the query.
 */

/**
 * @apiDefine MetaDataAndJWT
 * @apiDescription This call returns metadata in JSON format
 * and a JSON Web Token (JWT) which can be used to retrieve the recorded
 * content. The web token should be used with the
 * [/api/v1/signedUrl API](#api-SignedUrl-GetFile) to retrieve the file.
 */

/**
 * @apiDefine ApiEvent
 * @apiSuccessExample {json} ApiEvent:
 *  {
 *    "id": 33090,
 *    "dateTime": "2021-05-19T02:45:01.236Z",
 *    "createdAt": "2021-05-19T02:45:02.379Z",
 *    "DeviceId": 2008,
 *    "EventDetail": {
 *      "type": "alert",
 *      "details": {
 *        "foo": "bar",
 *        "foo2": "bar2"
 *      }
 *    },
 *    "Device": {
 *      "devicename": "test-camera"
 *    }
 *  }
 */

/**
 * @apiDefine EventExampleDescription
 * @apiParamExample {json} Using description:
 *  {
 *    "description": {
 *      "type": "example"
 *      "details": {"foo": "bar"},
 *    },
 *    "dateTimes": ["2017-11-13T00:47:51.160Z"]
 *  }
 */

/**
 * @apiDefine EventExampleEventDetailId
 * @apiParamExample {json} Using eventDetailId:
 *  {
 *    "eventDetailId": 1,
 *    "dateTimes": ["2017-11-13T00:47:51.160Z"]
 *  }
 */
/**
 * @apiDefine ApiGroupUserRelation
 * @apiSuccessExample {json} ApiGroupUserRelation
 *  {
 *    id: 123,
 *    username: "name of user making query",
 *    GroupUsers: {
 *      admin: true,
 *      createdAt: "2017-11-13T00:47:51.160Z",
 *      updatedAt: "2017-11-13T00:47:51.160Z",
 *      GroupId: 234,
 *      UserId: 123
 *    }
 *  }
 */
/**
 * @apiDefine ApiGroupUser
 * @apiSuccessExample {json} ApiGroupUser
 *  {
 *    username: "name-of-a-group-member",
 *    id: 1234,
 *    isAdmin: false
 *  }
 */
/**
 * @apiDefine ApiDeviceIdAndName
 * @apiSuccessExample {json} ApiDeviceIdAndName
 *  {
 *    id: 123456,
 *    devicename: "test-camera"
 *  }
 */
