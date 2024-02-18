import { SMTPClient } from "emailjs";
import { createEmailWithTemplate, urlNormaliseName} from "../emails/htmlEmailUtils.js";
import config from "@config";
import type { MonitoringParams } from "../api/V1/monitoringPage.js";
import { calculateMonitoringPageCriteria } from "../api/V1/monitoringPage.js";
import { generateVisits, Visit} from "../api/V1/monitoringVisit.js";
import modelsInit from "@models/index.js";
import { RecordingType } from "@typedefs/api/consts.js";
import { sendEmail } from "@/emails/sendEmail.js";
import logger from "@/logging.js";
import { ClientError } from "../api/customErrors.js";

const sendDigestEmail = async (templateFilename, users, emailSubject, timeframe) => {
  try {
    const models = await modelsInit();
    users.forEach(async user => {
      const requestUser = user;
      // let activeDevices = false;
      const powerUpEvents = await models.Event.latestEvents(user.id, null, {
        useCreatedDate: false,
        admin: true,
        eventType: ["rpi-power-on"],
      });

      // powerUpEvents.forEach(event => {
      //   const eventDateTime = new Date(event.dataValues.dateTime);
      //   if (eventDateTime > timeframe && eventDateTime <= new Date()) {
      //     activeDevices = true; 
      //   }       
      // });
      // if (activeDevices) {
        console.log("Tjere are active devices")
        user.dataValues.Groups.forEach(async group => {
          const recordingData = {};
          const stations = await models.Station.findAll({where: {
            'GroupId': group.id
          }});
          const stationsArray = stations.map(station => station.id);
          const now = new Date();
          const params: MonitoringParams = {
            stations: stationsArray,
            groups: [group.id],
            page: 1,
            pageSize: 100,
            from: timeframe,
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
          
          let visitsTotal;
          let speciesListArray;
          if (Array.isArray(visits) && visits.every(visit => visit instanceof Visit)) {
            visits.forEach(visit => {
              if (recordingData[visit.classification] !== undefined) {
                recordingData[visit.classification] += 1;
              } else {
                recordingData[visit.classification] = 1;
              }
            });

            visitsTotal = visits.length;
            speciesListArray = Object.entries(recordingData).map(([species, count]) => {
              return { species, count, widthPercent: 100 / Object.keys(recordingData).length };
            });
          };

          const interpolants: {
            [key: string]: any;
          } = {
            groupName: `${group.groupName}`,
            groupURL: urlNormaliseName(`https://browse-next.cacophony.org.nz/${group.groupName}`),
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
          console.log("The email is: ", user.email);
         return sendEmail(
            html,
            text,
            `${user.email}`,
            emailSubject,
          );
        });
      // }
    });
  } catch (error) {
    logger.error("%s", error);
  }
};


(async () => {
  try {
    const models = await modelsInit();
    const dailyDigestUsers = await models.User.findAll({
      where: {
        'settings.emailNotifications.dailyDigest': true
      },
      include: [
        {
          model: models.Group,
          attributes: ["id", "groupName"],
          required: true
        }
      ]
    });
    const weeklyDigestUsers = await models.User.findAll({
      where: {
        'settings.emailNotifications.weeklyDigest': true
      },
      include: [
        {
          model: models.Group,
          attributes: ["id", "groupName"],
          required: true
        }
      ]
    });

    const dailyTemplateFilename = "daily-digest.html";
    const weeklyTemplateFilename = "weekly-digest.html";
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    await sendDigestEmail(dailyTemplateFilename, dailyDigestUsers, "Daily digest", oneDayAgo);
    await sendDigestEmail(weeklyTemplateFilename, weeklyDigestUsers, "Weekly digest", oneWeekAgo);
  } catch (error) {
    logger.error("An error occurred:", error);
  }
})();