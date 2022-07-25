"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserGlobalPermission = exports.DeviceType = exports.AcceptableTag = exports.RecordingProcessingState = exports.TagMode = exports.RecordingPermission = exports.RecordingType = void 0;
var RecordingType;
(function (RecordingType) {
    RecordingType["ThermalRaw"] = "thermalRaw";
    RecordingType["Audio"] = "audio";
})(RecordingType = exports.RecordingType || (exports.RecordingType = {}));
var RecordingPermission;
(function (RecordingPermission) {
    RecordingPermission["DELETE"] = "delete";
    RecordingPermission["TAG"] = "tag";
    RecordingPermission["VIEW"] = "view";
    RecordingPermission["UPDATE"] = "update";
})(RecordingPermission = exports.RecordingPermission || (exports.RecordingPermission = {}));
var TagMode;
(function (TagMode) {
    TagMode["Any"] = "any";
    TagMode["UnTagged"] = "untagged";
    TagMode["Tagged"] = "tagged";
    TagMode["HumanTagged"] = "human-tagged";
    TagMode["AutomaticallyTagged"] = "automatic-tagged";
    TagMode["BothTagged"] = "both-tagged";
    TagMode["NoHuman"] = "no-human";
    TagMode["AutomaticOnly"] = "automatic-only";
    TagMode["HumanOnly"] = "human-only";
    TagMode["AutomaticHuman"] = "automatic+human";
})(TagMode = exports.TagMode || (exports.TagMode = {}));
var RecordingProcessingState;
(function (RecordingProcessingState) {
    RecordingProcessingState["Corrupt"] = "CORRUPT";
    RecordingProcessingState["Tracking"] = "tracking";
    RecordingProcessingState["AnalyseThermal"] = "analyse";
    RecordingProcessingState["Finished"] = "FINISHED";
    RecordingProcessingState["ToMp3"] = "toMp3";
    RecordingProcessingState["Analyse"] = "analyse";
    RecordingProcessingState["Reprocess"] = "reprocess";
    RecordingProcessingState["TrackingFailed"] = "tracking.failed";
    RecordingProcessingState["AnalyseThermalFailed"] = "analyse.failed";
    RecordingProcessingState["ToMp3Failed"] = "toMp3.failed";
    RecordingProcessingState["AnalyseFailed"] = "analyse.failed";
    RecordingProcessingState["ReprocessFailed"] = "reprocess.failed";
    RecordingProcessingState["AnalyseTest"] = "analyse.test";
})(RecordingProcessingState = exports.RecordingProcessingState || (exports.RecordingProcessingState = {}));
var AcceptableTag;
(function (AcceptableTag) {
    AcceptableTag["NoMotion"] = "no motion";
    AcceptableTag["Motion"] = "motion";
    AcceptableTag["Cool"] = "cool";
    AcceptableTag["RequiresReview"] = "requires review";
    AcceptableTag["InteractionWithTrap"] = "interaction with trap";
    AcceptableTag["MissedTrack"] = "missed track";
    AcceptableTag["MultipleAnimals"] = "multiple animals";
    AcceptableTag["TrappedInTrap"] = "trapped in trap";
    AcceptableTag["MissedRecording"] = "missed recording";
})(AcceptableTag = exports.AcceptableTag || (exports.AcceptableTag = {}));
var DeviceType;
(function (DeviceType) {
    DeviceType["Audio"] = "audio";
    DeviceType["Thermal"] = "thermal";
    DeviceType["Unknown"] = "unknown";
})(DeviceType = exports.DeviceType || (exports.DeviceType = {}));
var UserGlobalPermission;
(function (UserGlobalPermission) {
    UserGlobalPermission["Write"] = "write";
    UserGlobalPermission["Read"] = "read";
    UserGlobalPermission["Off"] = "off";
})(UserGlobalPermission = exports.UserGlobalPermission || (exports.UserGlobalPermission = {}));
