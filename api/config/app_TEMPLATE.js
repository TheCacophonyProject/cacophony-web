// Config instructions: Fill out required fields and save as 'app.js'

export const server = {
  // General server settings
  passportSecret: "random string", // REQUIRED, String. Random string used for passport module for encrypting JWT.
  loggerLevel: "debug", // REQUIRED, one of ('debug', 'warning', 'info', 'error')
  http: {
    active: true,
    port: 80,
  },
  recording_url_base: "http://localhost:8080/recording",
  browse_url: "http://localhost:8080",
  adminEmails: [],
  isLocalDev: true,
};

export const database = {
  username: "root",
  password: "",
  database: "cacophony",
  host: "localhost",
  dialect: "postgres",
  slowQueryLogThresholdMs: 1000,
};

export const s3Local = {
  // Used for storing audio & video recordings.
  publicKey: "", // REQUIRED, String:
  privateKey: "", // REQUIRED, String
  bucket: "cacophony", // REQUIRED, String
  endpoint: "http://localhost:9000", // REQUIRED, URL
  rootPath: "/.data/", // Root of the minio storage directory, so we can work out total and available disk space.
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
  from_name: "Cacophony Reporting",
  //
  // service: "gmail",
  // auth: {
  //   user: "noinfo@cacophony.org.nz",
  //   pass: "thesecretpassword"
  // }
};

export const influx = {
  host: "",
  database: "",
  username: "",
  password: "",
};

// List of devices to ignore when making the service error report.
export const deviceErrorIgnoreList = [];

// This is needed because Sequelize looks for development by default when using db:migrate
export const development = database;

export default {
  smtpDetails,
  server,
  s3Local,
  s3Archive,
  database,
  development: database,
  influx,
  deviceErrorIgnoreList
};
