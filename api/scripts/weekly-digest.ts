import { SMTPClient } from 'emailjs';
import { createEmailWithTemplate } from '../emails/htmlEmailUtils.js';

(async () => {
    const templateFilename = 'weekly-digest.html';
    const interpolants = {
        groupName: 'Morgans Valley',
        groupURL: 'https://browse-next.cacophony.org.nz/',
        visitsTotal: 100,
        speciesList: '10 possum\n3 cats\n1 hedgehog',
        recordingUrl: 'https://browse-next.cacophony.org.nz/',
        emailSettingsUrl: 'gmail.com',
        cacophonyBrowseUrl: 'https://browse-next.cacophony.org.nz/',
        cacophonyDisplayUrl: 'Cacophony monitoring platform'
    };

    const { text, html } = await createEmailWithTemplate(templateFilename, interpolants);

    const client = new SMTPClient({
        user: '',
        password: '',
        host: 'smtp.gmail.com',
        ssl: true,
    });

    const emailData = {
        text: text,
        from: 'Will @ Cacophony <willgeorgeson123@gmail.com>',
        to: 'Recipient <will@cacophony.org.nz>',
        subject: 'Weekly digest',
        attachment: [{ data: html, alternative: true }],
    };

    client.send(emailData, (err, message) => {
        console.log(err || message);
    });
})();
