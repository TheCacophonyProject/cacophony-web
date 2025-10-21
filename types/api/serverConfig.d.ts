import type {DeviceId, GroupId, UserId} from "./common";

type DatabaseConfig = {
    benchmark?: boolean;
    username: string;
    password: string;
    database: string;
    port?: number;
    host: string;
    dialect: string;
    slowQueryLogThresholdMs: number;
};

export type LoadedServerConfig = {
    server: {
        passportSecret: string;
        isLocalDev: boolean;
        loggerLevel: "info" | "debug" | "warn" | "error";
        http: {
            active: true,
            port: 1080
        },
        recordingUrlBase: string;
        browseUrl: string;
        // Email addresses for admins of this installation
        adminEmails?: string[];
    },
    s3Local: {
        publicKey: string;
        privateKey: string;
        bucket: string;
        endpoint: string;
        rootPath: string;  // Root of the minio storage directory, so we can work out total and available disk space.
    },
    s3Archive: {
        publicKey: string;
        privateKey: string;
        bucket: string;
        endpoint: string;
        freeSpaceThresholdRatio: number;
    },
    database: DatabaseConfig,

    // This is needed because Sequelize looks for development by default
    // when using db:migrate
    development: DatabaseConfig,
    smtpDetails: {
        host: string;
        port: 25 | 7777;  // default for service is 25. 7777 used for smtp-tester
        tls: boolean; // default is `true`.  `false` used for smtp-tester
        fromName: string;
        platformUsageEmail: string;
        serviceErrorsEmail: string;
    },
    influx: {
        host: string;
        database: string;
        username: string;
        password: string;
    },
    grafana: {
        host: string;
        apiKey: string;
    },
    // Any user IDs in this array are considered processing users, and have access to
    // processing-only APIs.
    processingUserIds: UserId[];
    // For group IDs in this array, only direct users of that group will be able to view or download
    // thermal recordings made by the group devices.  All super user accounts (excluding the one used
    // by AI processing) will be served a dummy thermal recording when accessing any thermal recording
    // from this group account.
    groupIdsWithRedactedThermalRecordings: GroupId[];

    // When testing in CI, we don't know what ID a group will be assigned, so we use the group name
    // to determine if a groups' thermal recordings should not be available even to non-processing
    // super-users.
    groupNamesWithRedactedThermalRecordings: string[];
    // List of devices to ignore when making the service error report.
    deviceErrorIgnoreList: DeviceId[];
    // List of Cacophony users to ignore in platform usage report
    cacophonyUserIds: UserId[];
    // List of Cacophony groups to ignore in platform usage report
    cacophonyGroupIds: GroupId[];
}

export type ServerConfig = LoadedServerConfig & {
    euaVersion: number,
    productionEnv: boolean,
    timeZone: string,
};