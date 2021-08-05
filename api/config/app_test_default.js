// A real test configuration
// @todo: consider reading from env vars
exports.server = {
  passportSecret: "something",
  loggerLevel: "debug",
  http: {
    active: true,
    port: 1080,
  },
  recording_url_base: "http://test.site/recording",
};
exports.s3Local = {
  publicKey: "minio",
  privateKey: "miniostorage",
  bucket: "cacophony",
  endpoint: "http://127.0.0.1:9001",
  rootPath: "/.data/", // Root of the minio storage directory, so we can work out total and available disk space.
};
exports.fileProcessing = {
  port: 2008,
};
// ======= Database settings =======
exports.database = {
  username: "test",
  password: "test",
  database: "cacophonytest",
  host: "localhost",
  dialect: "postgres",
  slowQueryLogThresholdMs: 1000,
};

exports.s3Archive = {
  publicKey: "", // REQUIRED, String:
  privateKey: "", // REQUIRED, String
  bucket: "CacophonyBackblazeTest", // REQUIRED, String
  endpoint: "s3.us-west-002.backblazeb2.com", // REQUIRED, URL
  freeSpaceThresholdRatio: 0.7,
};

exports.smtpDetails = {
  service: "gmail",
  auth: {
    user: "noinfo@cacophony.org.nz",
    pass: "thesecretpassword",
  },
};
// This is needed because Sequelize looks for development by default
// when using db:migrate
exports.development = exports.database;
exports.default = {
  smtpDetails: exports.smtpDetails,
  server: exports.server,
  s3Local: exports.s3Local,
  s3Archive: exports.s3Archive,
  fileProcessing: exports.fileProcessing,
  database: exports.database,
};
