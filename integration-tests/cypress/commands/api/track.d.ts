/// <reference types="../types" />

declare namespace Cypress {
  type ApiTrackDataRequest = import("@typedefs/api/track").ApiTrackDataRequest;
  type ApiTrackResponse = import("@typedefs/api/track").ApiTrackResponse;
  type ApiTrackTagRequest = import("@typedefs/api/trackTag").ApiTrackTagRequest;

  interface Chainable {
    /**
     * Add a track to a recording. 
     * Optionally check for a non-200 return statusCode
     * Saves the track Id against trackName
     *   Optionally set trackName=null to not save the id
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiTrackAdd(
      userName: string,
      recordingNameOrId: string,
      trackName: string,
      algorithmName: string,
      data: ApiTrackDataRequest,
      algorithm: any,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Delete a track from a recording.
     * Optionally check for a non-200 return statusCode
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * By default track ID is looked up by name using trackNameOrId
     *   Optionally, use the ID provided in trackNameOrId by specifying
     *     additionalChecks["useRawTrackId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiTrackDelete(
      userName: string,
      recordingNameOrId: string,
      trackNameOrId: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Retrieve and check a track from a recording.
     * Calls /recording/:id/tracks (GET)
     * Verfiy that the tracks data matched the expectedtracks
     * Optionally: Exclude checks on specific values by specifying them in excludeChecksOn
     * Optionally check for a non-200 return statusCode
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiTrackCheck(
      userName: string,
      recordingNameOrId: string,
      expectedTracks: ApiTrackResponse[],
      excludeCheckOn?: string[],
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Add or update a track tag for a recording. 
     * Optionally check for a non-200 return statusCode
     * Saves the tag Id against tagName
     *   Optionally set tagName=null to not save the id
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * By default track ID is looked up by name using trackNameOrId
     *   Optionally, use the ID provided in trackNameOrId by specifying
     *     additionalChecks["useRawTrackId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiTrackTagAdd(
      userName: string,
      recordingNameOrId: string,
      trackNameOrId: string,
      tagName: string,
      data: ApiTrackTagRequest,
      statusCode?: number,
      additionalChecks?: any
    ): any;

    /**
     * Add a track tag for a recording using tagJWT for access (power-tagger).
     * Optionally check for a non-200 return statusCode
     * Saves the tag Id against tagName
     *   Optionally set tagName=null to not save the id
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * By default track ID is looked up by name using trackNameOrId
     *   Optionally, use the ID provided in trackNameOrId by specifying
     *     additionalChecks["useRawTrackId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiTrackTagReplaceTag(
      userName: string,
      recordingNameOrId: string,
      trackNameOrId: string,
      tagName: string,
      data: ApiTrackTagRequest,
      statusCode?: number,
      additionalChecks?: any
      ): any;


    /**
     * Delete a track tag from a recording.
     * Optionally check for a non-200 return statusCode
     * By default recording ID is looked up by name using recordingNameOrId
     *   Optionally, use the ID provided in recordingNameOrId by specifying
     *     additionalChecks["useRawRecordingId"]=true
     * By default track ID is looked up by name using trackNameOrId
     *   Optionally, use the ID provided in trackNameOrId by specifying
     *     additionalChecks["useRawTrackId"]=true
     * By default tag ID is looked up by name using tagNameOrId
     *   Optionally, use the ID provided in tagNameOrId by specifying
     *     additionalChecks["useRawTagId"]=true
     * Optionally, check that returned messages[] contains additionalChecks["message"]
     */
    apiTrackTagDelete(
      userName: string,
      recordingNameOrId: string,
      trackNameOrId: string,
      tagNameOrId: string,
      statusCode?: number,
      additionalChecks?: any
    ): any;

  }
}

