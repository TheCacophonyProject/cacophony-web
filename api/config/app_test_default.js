// A real test configuration
// @todo: consider reading from env vars

export const server = {
  passportSecret: "something",
  loggerLevel: "debug",
  http: {
    active: true,
    port: 1080,
  },
  recording_url_base: "http://test.site/recording",
  browse_url: "http://test.site",
  isLocalDev: true,
};
export const s3Local = {
  publicKey: "minio",
  privateKey: "miniostorage",
  bucket: "cacophony",
  endpoint: "http://127.0.0.1:9001",
  rootPath: "/.data/", // Root of the minio storage directory, so we can work out total and available disk space.
};

// ======= Database settings =======
export const database = {
  username: "test",
  password: "test",
  database: "cacophonytest",
  host: "localhost",
  dialect: "postgres",
  slowQueryLogThresholdMs: 1000,
};

export const s3Archive = {
  publicKey: "", // REQUIRED, String:
  privateKey: "", // REQUIRED, String
  bucket: "CacophonyBackblazeTest", // REQUIRED, String
  endpoint: "s3.us-west-002.backblazeb2.com", // REQUIRED, URL
  freeSpaceThresholdRatio: 0.7,
};

export const smtpDetails = {
  host: "localhost",
  port: 7777, //default for service is 25. 7777 used for smtp-tester
  tls: false, //default is true.  False used for smtp-tester
  fromName: "Cacophony Reporting",
  platformUsageEmail: "usage@example.com"

  //   service: "gmail",
  //   auth: {
  //     user: "noinfo@cacophony.org.nz",
  //     pass: "thesecretpassword"
  //   }
};


// List of devices to ignore when making the service error report.
export const deviceErrorIgnoreList = [];
// List of Cacophony users to ignore in platform usage report
export const cacophonyUserIds = [];
// List of Cacophony groups to ignore in platform usage report
export const cacophonyGroupIds = [];
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
  cacophonyGroupIds
};
