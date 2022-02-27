BEGIN;
set statement_timeout = 120000;
-- Delete privilages for test users
DELETE FROM "GroupUsers" where "UserId" in (select "id" from "Users" u where u."username" like 'cy_%');
DELETE FROM "GroupUsers" where "GroupId" in (select "id" from "Groups" g where g."groupname" like 'cy_%');

-- Delete Tracks, Tags and TrackTags attached to test recordings
DELETE FROM "Tags" where "RecordingId" in (
    select "id" from "Recordings" r where r."DeviceId" in (
        select "id" from "Devices" d where d."devicename" like 'cy_%'
        )
    );

DELETE FROM "TrackTags" where "TrackId" in (
    select "id" from "Tracks" t where t."RecordingId" in (
        select "id" from "Recordings" r where r."DeviceId" in (
            select "id" from "Devices" d where d."devicename" like 'cy_%'
        )
    )
);

DELETE FROM "Tracks" where "RecordingId" in (
    select "id" from "Recordings" r where r."DeviceId" in (
        select "id" from "Devices" d where d."devicename" like 'cy_%'
    )
);

-- Delete recordings made by test groups and devices
DELETE FROM "Recordings" where "DeviceId" in (select "id" from "Devices" d where d."devicename" like 'cy_%');
DELETE FROM "Recordings" where "GroupId" in (select "id" from "Groups" g where g."groupname" like 'cy_%');

-- Delete Events for device
DELETE from "Events" where "DeviceId" in (select "id" from "Devices" d where d."devicename" like 'cy_%');

-- Delete stations for device
DELETE from "Stations" where "GroupId" in (select "id" from "Groups" g where g."groupname" like 'cy_%');

-- delete users device and groups from testing
DELETE FROM "Devices" where "devicename" like 'cy_%';
DELETE FROM "Groups" where "groupname" like 'cy_%';
-- DELETE FROM "Users" where "username" like 'cy_%';
END; 

-- Hack by Matt - delete users 100 at a time to avoid timeout limit
DELETE FROM "Users" where id in (select id from "Users" where "username" like 'cy_%' limit 100);
DELETE FROM "Users" where id in (select id from "Users" where "username" like 'cy_%' limit 100);
DELETE FROM "Users" where id in (select id from "Users" where "username" like 'cy_%' limit 100);

