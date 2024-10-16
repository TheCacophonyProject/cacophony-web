// load the global Cypress types
/// <reference types="cypress" />
/// <reference path="../commands/api/authenticate.d.ts" />
/// <reference path="../commands/api/group.d.ts" />
/// <reference path="../commands/api/group-station.d.ts" />
/// <reference path="../commands/api/device.d.ts" />
/// <reference path="../commands/api/user.d.ts" />
/// <reference path="../commands/api/alerts.d.ts" />
/// <reference path="../commands/api/events.d.ts" />
/// <reference path="../commands/api/monitoring.d.ts" />
/// <reference path="../commands/api/recording.d.ts" />
/// <reference path="../commands/api/recording-tests.d.ts" />
/// <reference path="../commands/api/recording-tag.d.ts" />
/// <reference path="../commands/api/station.d.ts" />
/// <reference path="../commands/api/track.d.ts" />
/// <reference path="../commands/api/visits.d.ts" />
/// <reference path="../commands/browsegui/user.d.ts" />
/// <reference path="../commands/browsegui/groups.d.ts" />
/// <reference path="../commands/browsegui/general.d.ts" />

// Reexport types in Cypress namespace
declare namespace Cypress {
  type ApiStationData = import("@commands/types").ApiStationData;
  type ApiStationResponse = import("@typedefs/api/station").ApiStationResponse;
  type StationId = import("@typedefs/api/common").StationId;

  type ApiTrackDataRequest = import("@typedefs/api/track").ApiTrackDataRequest;
  type ApiTrackResponse = import("@typedefs/api/track").ApiTrackResponse;
  type ApiTrackTagRequest = import("@typedefs/api/trackTag").ApiTrackTagRequest;

  type TestThermalRecordingInfoAlias =
    import("@commands/types").TestThermalRecordingInfo;
  type RecordingIdAlias = import("@typedefs/api/common").RecordingId;
  type ApiRecordingTagRequest =
    import("@typedefs/api/tag").ApiRecordingTagRequest;

  type ApiRecordingSet = import("@commands/types").ApiRecordingSet;
  type ApiRecordingReturned = import("@commands/types").ApiRecordingReturned;
  type ApiRecordingColumns = import("@commands/types").ApiRecordingColumns;
  type ApiRecordingNeedsTagReturned =
    import("@commands/types").ApiRecordingNeedsTagReturned;
  type ApiRecordingDataMetadata =
    import("@commands/types").ApiRecordingDataMetadata;
  type Interception = import("cypress/types/net-stubbing").Interception;
  type ApiRecordingResponse =
    import("@typedefs/api/recording").ApiRecordingResponse;
  type TestThermalRecordingInfo =
    import("@commands/types").TestThermalRecordingInfo;
  type RecordingId = number;

  type ApiAudioRecordingResponse =
    import("@typedefs/api/recording").ApiAudioRecordingResponse;
  type ApiThermalRecordingResponse =
    import("@typedefs/api/recording").ApiThermalRecordingResponse;

  type TestVisitSearchParams = import("@commands/types").TestVisitSearchParams;
  type TestComparableVisit = import("@commands/types").TestComparableVisit;
  type ApiGroupReturned = import("@commands/types").ApiGroupReturned;
  type ApiDeviceIdAndName = import("@commands/types").ApiDeviceIdAndName;
  type ApiGroupsDevice = import("@commands/types").ApiGroupsDevice;
  type ApiStationDataAlias = import("@commands/types").ApiStationData;
  type ApiStationDataReturned =
    import("@commands/types").ApiStationDataReturned;
  type ApiDeviceResponseAlias =
    import("@typedefs/api/device").ApiDeviceResponse;
  type ApiGroupUserRelationshipResponse =
    import("@typedefs/api/group").ApiGroupUserResponse;

  type TestComparablePowerEvent =
    import("@commands/types").TestComparablePowerEvent;
  type ApiEventDetail = import("@commands/types").ApiEventDetail;
  type ApiEventReturned = import("@commands/types").ApiEventReturned;
  type ApiEventErrorCategory = import("@commands/types").ApiEventErrorCategory;
  type ApiPowerEventReturned = import("@commands//types").ApiPowerEventReturned;

  type ApiDeviceResponse = import("@typedefs/api/device").ApiDeviceResponse;
  type LatLng = import("@typedefs/api/common").LatLng;
  type ApiGroupsUserRelationshipResponse =
    import("@typedefs/api/group").ApiGroupUserResponse;
  type DeviceType = import("@typedefs/api/consts").DeviceType;
  type DeviceHistoryEntry = import("@commands/types").DeviceHistoryEntry;
  type DeviceId = import("@typedefs/api/common").DeviceId;
  type ApiMaskRegionsData = import("@typedefs/api/device").ApiMaskRegionsData;
  type ApiAuthenticateAccess = import("@commands//types").ApiAuthenticateAccess;

  type ApiAlertCondition = import("@typedefs/api/alerts").ApiAlertCondition;
  type AlertId = import("@typedefs/api/common").AlertId;
  type ApiAlertResponse = import("@typedefs/api/alerts").ApiAlertResponse;
}
