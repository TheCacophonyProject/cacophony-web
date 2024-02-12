import { SMTPClient } from "emailjs";
import { createEmailWithTemplate } from "../emails/htmlEmailUtils.js";
import config from "@config";
import type { MonitoringParams } from "../api/V1/monitoringPage.js";
import { calculateMonitoringPageCriteria } from "../api/V1/monitoringPage.js";
import { generateVisits } from "../api/V1/monitoringVisit.js";
import modelsInit from "@models/index.js";
import { RecordingType } from "@typedefs/api/consts.js";

(async () => {
  try {
    const models = await modelsInit();
    const users = await models.User.findAll({where: {
      'settings.emailNotifications.weeklyDigest': true
    }});
    
    const templateFilename = "weekly-digest.html";
    const client = new SMTPClient(config.smtpDetails);
    // const client = new SMTPClient({
    //   user: "",
    //   password: "",
    //   host: "smtp.gmail.com",
    //   ssl: true,
    // });

    users.forEach(async user => {
      const requestUser = user;
      const groups = await models.GroupUsers.findAll({where: {
        'UserId': user.id
      }});

      groups.forEach(async group => {
        const recordingData = {};
        const name = await models.Group.findOne({where: {
          'id': group.GroupId
        }});

        const stations = await models.Station.findAll({where: {
          'GroupId': group.GroupId
        }});
        const stationsArray = [];
        stations.forEach(async station => {
          stationsArray.push(station.id);
        });

        const oneWeekAgo = new Date();
        const now = new Date();
        oneWeekAgo.setHours(oneWeekAgo.getHours() - 168);

        const params: MonitoringParams = {
          stations: stationsArray,
          groups: [group.GroupId],
          page: 1,
          pageSize: 100,
          from: oneWeekAgo,
          until: now,
          types: [RecordingType.ThermalRaw]
        };

        const viewAsSuperAdmin = true;
        const searchDetails = await calculateMonitoringPageCriteria(
          requestUser,
          params,
          viewAsSuperAdmin
        );
      
        searchDetails.compareAi = "Master";
        searchDetails.types = params.types;
      
        const visits = await generateVisits(
          requestUser.id,
          searchDetails,
          viewAsSuperAdmin
        );
        
        (visits as unknown as Array<any>).forEach(async visit => {
          if (recordingData[visit.classification] !== undefined) {
            recordingData[visit.classification] += 1;
          } else {
            recordingData[visit.classification] = 1;
          }
        });

        const visitsTotal = (visits as unknown as Array<any>).length;
        const speciesListArray = Object.entries(recordingData).map(([species, count]) => {
          return { species, count, widthPercent: 100 / Object.keys(recordingData).length };
        });

        const interpolants: {
          [key: string]: any;
        } = {
          groupName: `${name.groupName}`,
          groupURL: `https://browse-next.cacophony.org.nz/${name.groupName}`,
          visitsTotal: visitsTotal,
          speciesList: speciesListArray,
          recordingUrl: "https://browse-next.cacophony.org.nz/",
          emailSettingsUrl: "https://browse-next.cacophony.org.nz/",
          cacophonyBrowseUrl: "https://browse-next.cacophony.org.nz/",
          cacophonyDisplayUrl: "Cacophony monitoring platform",
        };

        const { text, html } = await createEmailWithTemplate(
          templateFilename,
          interpolants
        );
        
        const emailData = {
          text: text,
          from: config.smtpDetails.from_name,
          to: `${user.userName} <>`,
          subject: "Weekly digest",
          attachment: [{ data: html.replace('<div id="speciesListContainer"', `<div id="speciesListContainer"`), alternative: true }],
        };

        client.send(emailData, (err, message) => {
          console.log(err || message);
        });
      });

    });

  } catch (error) {
    console.error("An error occurred:", error);
  }
})();
