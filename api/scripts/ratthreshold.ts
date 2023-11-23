import process from "process";
import { program } from "commander";
import pkg from "pg";
const { Client } = pkg;
import * as config from "../config.js";
let Config;

const HEIGHT = 120
const WIDTH = 160
const BOX_DIM = 30
async function main() {
  program
    .option("--config <path>", "Configuration file", "./config/app.js")
    .parse(process.argv);
  const options = program.opts();
  Config = {
    ...config.default,
    ...(await config.default.loadConfig(options.config)),
  };
  console.log("Connecting to db");
  const pgClient = await pgConnect();
  const devices = await getDeviceLocation(pgClient);
  for(const devHistory of devices.rows){

    console.log("Checking device ",devHistory["uuid"])
    const rodentQ = await getRodentData(pgClient,devHistory["DeviceId"],devHistory["location"]);
    // byDevice = {}
    let currentDevice = null
    if(rodentQ.rows.length == 0){
      console.log("No data skipping")
      continue;
    }
    for (const rodentRec of rodentQ.rows){
      let positions = rodentRec["data"]["positions"].filter((x)=> x["mass"]>0 &&  !x["blank"])
      if (!currentDevice){
        currentDevice ={uuid:rodentRec["uuid"], location:rodentRec["location"], trackData: positions}
      }else{
        currentDevice.trackData.push(...positions)
      }
    }
    const rows = Math.ceil(WIDTH /BOX_DIM)
    const columns = Math.ceil(HEIGHT / BOX_DIM)
    const gridData = [...Array(rows)].map(e => [...Array(columns)].map(e=>Array()));
    // could speed this up
    for(const pos of currentDevice.trackData){
      for (let y = 0; y < gridData.length; y++) {
        for (let x = 0; x < gridData[y].length; x++) {
          if( overlap_rect(pos,[x*BOX_DIM,y*BOX_DIM,BOX_DIM,BOX_DIM ])){
            gridData[y][x].push(pos["mass"])
          }
        }
      }
    }
    const rowMins =Array(rows)
    const columnMins =Array(columns)

    for (let y = 0; y < gridData.length; y++) {
      let rowMin = null
      for (let x = 0; x < gridData[y].length; x++) {
          let masses = gridData[y][x]
          if(masses.length > 0){
          masses = masses.sort(function (a, b) {  return a - b;  });
          let percentile80 = Math.floor(masses.length *0.8)
           gridData[y][x] = masses[percentile80]
           if(rowMin ==null  ||  masses[percentile80] < rowMin){
             rowMin = masses[percentile80]
           }
           if(columnMins[x] == undefined  ||  masses[percentile80] < columnMins[x]){
             columnMins[x] = masses[percentile80]
           }
         }else{
           gridData[y][x]=null
         }
        }
        rowMins[y]= rowMin
      }
      // can think about propogating data into empty regions, but probably no need
      //
      // for (let y = 0; y < gridData.length; y++) {
      //   for (let x = 0; x < gridData[y].length; x++) {
      //     if(gridData[y][x] == -1 as any){
      //
      //       if(rowMins[y]){
      //         gridData[y][x] = rowMins[y]
      //       }else if(columnMins[x]){
      //         gridData[y][x] = columnMins[x]
      //       }
      //
      //     }
      //   }
      // }
      let settings = devHistory["settings"]
      if (!settings){
        settings = {}
      }
      settings["ratThresh"] = gridData
      devHistory["settings"]=settings
      console.log("Updating device History",devHistory["uuid"], " with ", devHistory["settings"])
      await updateDeviceHistory(pgClient, devHistory["uuid"],devHistory["fromDateTime"] ,devHistory["settings"]);

    }

  }


function overlap_rect(region,grid){
  const x_overlap = overlap([region["x"], region["x"]+region["width"]], [grid[0],grid[0]+grid[2]])
  const y_overlap = overlap([region["y"], region["y"]+region["height"]], [grid[1],grid[1]+grid[3]])
  return x_overlap > 0 && y_overlap > 0
}

function overlap(first,second){
  return (
      (first[1] - first[0])
      + (second[1] - second[0])
      - (Math.max(first[1], second[1]) - Math.min(first[0], second[0]))
  )
}


async function updateDeviceHistory(client, uuid,fromDateTime,settings){
   const res = await client.query(
    `update "DeviceHistory" set "settings" = $1 where "uuid"= $2 and "fromDateTime"= $3`,
    [settings, uuid,fromDateTime]
  );
}

async function getDeviceLocation(client){
  	const res = await client.query(`select distinct on (dh."uuid") dh."DeviceId",dh."uuid", dh."location",dh."fromDateTime" from "DeviceHistory" dh  order by dh."uuid" ,dh."fromDateTime"  desc`);
    return res;
}
async function getRodentData(client, deviceId,location) {
  let locQuery = ""
  if(location){
    locQuery = `r."location"='${location}'`
  }else{
    locQuery = `r."location" is null`
  }
  const res = await client.query(
    `select r."recordingDateTime",
r."DeviceId" ,t.id,r."location" ,t.data
from
	"TrackTags" tt
right join "Tracks" t on
	tt."TrackId" = t.id
right join "Recordings" r on t."RecordingId"  = r.id
where
r."DeviceId"='${deviceId}' and ${locQuery} and
tt.automatic =false and
	tt.path ='all.mammal.rodent.mouse' order by r."DeviceId",r."recordingDateTime" desc`);
  return res;
}

async function pgConnect() {
  const dbconf = Config.database;
  const client = new Client({
    host: dbconf.host,
    port: dbconf.port,
    user: dbconf.username,
    password: dbconf.password,
    database: dbconf.database,
  });
  await client.connect();
  return client;
}

main()
  .catch((err) => {
    console.log(err);
  })
  .then(() => {
    process.exit(0);
  });
