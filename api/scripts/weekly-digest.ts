import { SMTPClient } from "emailjs";
import { createEmailWithTemplate } from "../emails/htmlEmailUtils.js";
import modelsInit from "@models/index.js";
import { Op } from "sequelize";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commonAttachments = async () => {
  const svgFilePath = path.join(__dirname, 'possum.svg');
  const buffer = await fs.readFile(svgFilePath);
  return [
    {
      content: buffer.toString('base64'),
      mimeType: 'image/svg+xml',
      cid: 'possum-svg',
    },
  ];
};

(async () => {
  try {
    const models = await modelsInit();
    const users = await models.User.findAll({where: {
      'settings.emailNotifications.weeklyDigest': true
    }});

    const templateFilename = "weekly-digest.html";

    const client = new SMTPClient({
      user: "",
      password: "",
      host: "smtp.gmail.com",
      ssl: true,
    });

    users.forEach(async user => {
      const recordingData = {};
      //find the id of the group the users in 
      const group = await models.GroupUsers.findOne({where: {
        'UserId': user.id
      }});

      //find the name of the group the users in
      const name = await models.Group.findOne({where: {
        'id': group.GroupId
      }});

      const oneWeekAgo = new Date();
      oneWeekAgo.setHours(oneWeekAgo.getHours() - 168);

      //find all the visits that are in that group in past week
      const visits = await models.Recording.findAll({where: {
        'GroupId': group.GroupId,
        'recordingDateTime': {
          [Op.gte]: oneWeekAgo
        }
      }});

      const visitPromises = visits.map(async visit => {
        const recordingInfo = await models.Track.findOne({
            where: { 'RecordingId': visit.id }
        });
    
        const tag = recordingInfo.data.predictions[0].confident_tag;
        if (recordingData[tag] !== undefined) {
            recordingData[tag] += 1;
        } else {
            recordingData[tag] = 1;
        }
       });

      await Promise.all(visitPromises);

      let visitsTotal = 0;
      for (const key in recordingData) {
        visitsTotal += recordingData[key];
      }

      const speciesListArray = Object.entries(recordingData).map(([species, count]) => {
        return { species, count, widthPercent: 100 / Object.keys(recordingData).length };
      });

      const interpolants : {
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
      const speciesListWidth = `calc(100% / ${speciesListArray.length})`;
      const speciesListStyle = `border: 2px solid #666666; width: 100%; margin-top: 10px; overflow: hidden; text-align: center; font-size: 0;`;
      
      const emailData = {
        text: text,
        from: "Cacophony <>",
        to: `${user.userName} <${user.email}>`,
        subject: "Weekly digest",
        attachment: [{ data: html.replace('<div id="speciesListContainer"', `<div id="speciesListContainer"`), alternative: true }],
      };

      client.send(emailData, (err, message) => {
        console.log(err || message);
      });
    });

  } catch (error) {
    console.error("An error occurred:", error);
  }
})();
