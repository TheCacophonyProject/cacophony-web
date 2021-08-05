// Template configuration for automated tests.
// Copy to `app_test.js` and fill in the sections indicated.

const server = {
  passportSecret: "something",
  loggerLevel: "debug",
  http: {
    active: true,
    port: 1080,
  },
};

const s3Local = {
  // Used for storing audio & video recordings.
  publicKey: "REQUIRED", // obtain from S3 server.
  privateKey: "REQUIRED", // obtain from S3 server
  bucket: "cacophony",
  endpoint: "http://localhost:9001",
  rootPath: "/.data/", // Root of the minio storage directory, so we can work out total and available disk space.
};

const s3Archive = {
  publicKey: "REQUIRED", // REQUIRED, String:
  privateKey: "REQUIRED", // REQUIRED, String
  bucket: "CacophonyBackblazeTest", // REQUIRED, String
  endpoint: "s3.us-west-002.backblazeb2.com", // REQUIRED, URL
  freeSpaceThresholdRatio: 0.7,
};

const fileProcessing = {
  port: 2008,
};

// ======= Database settings =======
const database = {
  username: "REQUIRED",
  password: "REQUIRED",
  database: "cacophonytest",
  host: "localhost",
  dialect: "postgres",
  slowQueryLogThresholdMs: 1000,
};

const smtpDetails = {
  service: "gmail",
  auth: {
    user: "noinfo@cacophony.org.nz",
    pass: "thesecretpassword",
  },
};

exports.smtpDetails = smtpDetails;
exports.server = server;
exports.s3Local = s3Local;
exports.s3Archive = s3Archive;
exports.fileProcessing = fileProcessing;
exports.database = database;

// This is needed because Sequelize looks for development by default
// when using db:migrate
exports.development = database;
exports.default = {
  smtpDetails: exports.smtpDetails,
  server: exports.server,
  s3Local: exports.s3Local,
  s3Archive: exports.s3Archive,
  fileProcessing: exports.fileProcessing,
  database: exports.database,
};
