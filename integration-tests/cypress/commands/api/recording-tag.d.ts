declare namespace Cypress {
  interface Chainable {
    /**
     * Add a tag to a recording.
     * Optionally check for a non-200 return statusCode
     * Saves the tag Id against tagName
     *   Optionally set tagName=null to not save the id
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiRecordingTagAdd(
      userName: string,
      recordingNameOrId: string,
      tagName: string,
      data: ApiRecordingTagRequest,
      statusCode?: number,
      additionalChecks?: any,
    ): any;

    /**
     * Delete a tag from a recording.
     * Optionally check for a non-200 return statusCode
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * By default tag ID is looked up by name using tagNameOrId
     *   Optionally, use the ID provided in tagNameOrId by specifying
     *     additionalChecks["useRawTagId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiRecordingTagDelete(
      userName: string,
      recordingNameOrId: string,
      tagNameOrId: string,
      statusCode?: number,
      additionalChecks?: any,
    ): any;

    /**
     * Check recording tags match expected
     * Calls /recording/:id (GET) but only checks the tags component of returned data
     * Optionally check for a non-200 return statusCode
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    testRecordingTagCheck(
      userName: string,
      recordingNameOrId: string,
      expectedTags: any[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any,
    ): any;
  }
}
