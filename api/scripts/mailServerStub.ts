// Call with node mailServerStub.js
const port = 7777
import { init } from  "smtp-tester";
import { writeFile, appendFile } from  "fs";
const mailServer = init(port)
writeFile('mailServerStub.log', "SERVER: started", err => {
  if (err) {
    console.error(err)
    return
  }
});

// process single emails
mailServer.bind((addr:string, id:number, email:any) => {
   let content:string = "";
   content = content+"SERVER: received email\n";
   content = content+`SERVER: from: ${email.sender}\n`;
   content = content+`SERVER: to: ${JSON.stringify(email.receivers)}\n`;
   content = content+`SERVER: body: ${email.data}\n`;
   content = content+"SERVER: end of mail\n";
   writeFile('mailServerStub.log', content, err => {
     if (err) {
       console.error(err)
       return
     }
   });
})

