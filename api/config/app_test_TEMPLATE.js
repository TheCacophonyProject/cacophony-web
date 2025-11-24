// Template configuration for automated tests.
// Copy to `app_test.js` and fill in the sections indicated.

export const server = {
  passportSecret: "something",
  loggerLevel: "debug",
  http: {
    active: true,
    port: 1080,
  },
  adminEmails: [],
  isLocalDev: true,
};

export const s3Local = {
  // Used for storing audio & video recordings.
  publicKey: "REQUIRED", // obtain from S3 server.
  privateKey: "REQUIRED", // obtain from S3 server
  bucket: "cacophony",
  endpoint: "http://localhost:9001",
  rootPath: "/.data/", // Root of the minio storage directory, so we can work out total and available disk space.
};

export const s3Archive = {
  publicKey: "REQUIRED", // REQUIRED, String:
  privateKey: "REQUIRED", // REQUIRED, String
  bucket: "CacophonyBackblazeTest", // REQUIRED, String
  endpoint: "s3.us-west-002.backblazeb2.com", // REQUIRED, URL
  freeSpaceThresholdRatio: 0.7,
};

// ======= Database settings =======
export const database = {
  username: "REQUIRED",
  password: "REQUIRED",
  database: "cacophonytest",
  host: "localhost",
  dialect: "postgres",
  slowQueryLogThresholdMs: 1000,
};

export const smtpDetails = {
  host: "localhost",
  port: 7777, //default for service is 25. 7777 used for smtp-tester
  tls: false, //default is true.  False used for smtp-tester
  fromName: "Cacophony Reporting",
  platformUsageEmail: "usage@example.com",
  serviceErrorsEmail: "service-errors@example.com",
};

// List of devices to ignore when making the service error report.
export const deviceErrorIgnoreList = [];
// List of Cacophony users to ignore in platform usage report
export const cacophonyUserIds = [];
// List of Cacophony groups to ignore in platform usage report
export const cacophonyGroupIds = [];

// Any user IDs in this array are considered processing users, and have access to
// processing-only APIs.
export const processingUserIds = [];

// For group IDs in this array, only direct users of that group will be able to view or download
// thermal recordings made by the group devices.  All super user accounts (excluding the one used
// by AI processing) will be served a dummy thermal recording when accessing any thermal recording
// from this group account.
export const groupIdsWithRedactedThermalRecordings = [];

// When testing, we don't know what ID a group will be assigned, so we use the group name
// to determine if a groups' thermal recordings should not be available even to non-processing
// super-users.
export const groupNamesWithRedactedThermalRecordings = [
  "super-secret-squirrels",
];

// When testing, we don't know what ID a user will be assigned, so we use the user name
// to determine if a user' thermal recordings should be available to a processing user.
export const processingSuperUserNames = ["processing-super-user"];

// This is needed because Sequelize looks for development by default
// when using db:migrate
export const development = database;
export default {
  smtpDetails,
  server,
  s3Local,
  s3Archive,
  database,
  development: database,
  deviceErrorIgnoreList,
  cacophonyUserIds,
  cacophonyGroupIds,
  processingUserIds,
  groupNamesWithRedactedThermalRecordings,
  groupIdsWithRedactedThermalRecordings,
};
