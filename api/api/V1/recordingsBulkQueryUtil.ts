import type {
  RecordingProcessingState,
  RecordingType,
} from "@typedefs/api/consts.js";
import { TagMode } from "@typedefs/api/consts.js";
import type { DeviceId, GroupId, StationId } from "@typedefs/api/common.js";
import sequelize, { Op } from "sequelize";
import type { ModelsDictionary } from "@models";

export const getRecordingsWhere = (
  groupId: GroupId,
  minDuration: number,
  types: RecordingType[],
  devices: DeviceId[],
  locations: StationId[],
  tagMode: TagMode,
  taggedWith: string[],
  subClassTags: boolean,
  includeFilteredTracks: boolean,
  labelledWith: string[],
  withTags: boolean,
  from?: Date,
  until?: Date,
  processingState?: RecordingProcessingState
) => {
  const requiresTags = [
    TagMode.AutomaticHumanUrlSafe,
    TagMode.HumanTagged,
    TagMode.AutomaticallyTagged,
  ].includes(tagMode);
  const recordingsWhere: any = {
    deletedAt: { [Op.eq]: null },
    GroupId: groupId,
    redacted: false,
    duration: { [Op.gte]: minDuration },
    [Op.and]: [],
  };
  if (types.length !== 0) {
    recordingsWhere.type = { [Op.in]: types };
  }
  if (processingState !== undefined) {
    recordingsWhere.processingState = processingState;
  }
  if (devices.length !== 0) {
    recordingsWhere.DeviceId = {
      [Op.in]: devices,
    };
  }
  if (locations.length !== 0) {
    recordingsWhere.StationId = {
      [Op.in]: locations,
    };
  }
  const hasTimeBound = from || until;
  if (hasTimeBound) {
    if (from && until) {
      recordingsWhere.recordingDateTime = {
        [Op.and]: [{ [Op.gte]: from }, { [Op.lt]: until }],
      };
    } else if (from) {
      recordingsWhere.recordingDateTime = { [Op.gte]: from };
    } else if (until) {
      recordingsWhere.recordingDateTime = { [Op.lt]: until };
    }
  }

  if (tagMode === TagMode.UnTagged) {
    recordingsWhere[Op.and].push({
      [Op.or]: [
        sequelize.where(sequelize.col('"Tracks".id'), Op.eq, null),
        sequelize.where(sequelize.col('"Tracks->TrackTags".id'), Op.eq, null),
      ],
    });
  } else if (taggedWith.length !== 0 && withTags) {
    // TagMode any or Tagged.
    recordingsWhere[Op.and].push({
      [Op.or]: [
        sequelize.where(sequelize.col('"Tracks->TrackTags".what'), {
          [Op.in]: taggedWith,
        }),
        ...(subClassTags
          ? taggedWith.map((tag) =>
              sequelize.where(
                sequelize.col('"Tracks->TrackTags".path'),
                "~",
                `*.${tag.replace(/-/g, "_")}.*`
              )
            )
          : []),
      ],
    });
  }
  if (labelledWith.length !== 0) {
    recordingsWhere[Op.and].push(
      sequelize.where(sequelize.col('"Tags".detail'), {
        [Op.in]: labelledWith,
      })
    );
  }
  if (!includeFilteredTracks && !requiresTags) {
    recordingsWhere[Op.and].push(
      sequelize.where(sequelize.col('"Tracks".filtered'), {
        [Op.eq]: false,
      })
    );
  }
  return recordingsWhere;
};

export const getFirstPass = (
  where: any,
  include: any,
  withTotalCount: boolean,
  loggingFn?: (message: string, time: number) => void
) => {
  const pass = {
    where,
    limit: 200,
    include,
    // NOTE: Turning off sub-queries here and forcing an inner join is important, as it makes queries > 10X faster.
    // Also note that this means we won't get back our `limit` recordings but it's better to do lots of smaller
    // fast incremental date range queries on the front-end rather than blocking on longer queries.
    subQuery: false,
    attributes: [
      "id",
      sequelize.col('"Tracks->TrackTags".automatic'),
      sequelize.col('"Tracks->TrackTags".what'),
      sequelize.col('"Tracks->TrackTags".path'),
    ],
    order: [["recordingDateTime", "desc"]],
  } as any;
  if (withTotalCount) {
    pass.group = '"Recording".id';
  }
  if (loggingFn) {
    pass.logging = loggingFn;
  }
  return pass;
};

export const getInclude = (
  models: ModelsDictionary,
  getAttributes: boolean,
  includeFilteredTracks: boolean,
  labelled: boolean,
  tagged: boolean,
  tagMode: TagMode,
  firstPass: boolean = false
) => {
  const trackWhere = {
    archivedAt: {
      [Op.is]: null,
    },
  };
  const trackTagWhere = {
    used: true,
    archivedAt: {
      [Op.is]: null,
    },
  };
  if (!includeFilteredTracks) {
    (trackTagWhere as any).what = { [Op.ne]: "false-positive" };
  }
  const requiresTags = [
    TagMode.HumanTagged,
    TagMode.AutomaticallyTagged,
    TagMode.AutomaticHumanUrlSafe,
  ].includes(tagMode);
  const isHumanOnlyTagMode = [TagMode.HumanOnly].includes(tagMode);
  if (!includeFilteredTracks && !getAttributes && !requiresTags) {
    // By default we don't include false-positive tracks

    // If it's the second pass, we do include them if the recording
    // passed false-positive filtering in the first pass.
    (trackWhere as any).filtered = false;
  }
  const include = [];
  include.push({
    model: models.Track,
    attributes: getAttributes ? ["id", "data"] : [],
    required: (tagged || requiresTags) && !isHumanOnlyTagMode,
    where: trackWhere,
    include: [
      {
        model: models.TrackTag,
        attributes: getAttributes
          ? ["what", "path", "UserId", "id", "automatic", "confidence"]
          : [],
        subQuery: false,
        required: (tagged || requiresTags) && !isHumanOnlyTagMode,
        include: getAttributes
          ? [{ model: models.User, attributes: ["userName"] }]
          : [],
        where: trackTagWhere,
      },
    ],
  });

  if (getAttributes) {
    (include as any[]).push(
      {
        model: models.Station,
        attributes: getAttributes ? ["name"] : [],
      },
      {
        model: models.Group,
        attributes: getAttributes ? ["groupName"] : [],
      },
      {
        model: models.Device,
        attributes: getAttributes ? ["deviceName"] : [],
      }
    );
  }
  if (!firstPass || labelled) {
    (include as any[]).push({
      model: models.Tag,
      attributes: getAttributes
        ? ["detail", "taggerId", "id", "comment", "createdAt"]
        : [],
      required: labelled,
    });
  }
  return include;
};

export const getRawSql = (
  models: ModelsDictionary,
  inOptions: any,
  isAutomatic: boolean
) => {
  const options = sequelize.Utils.cloneDeep(inOptions);
  options.include[0].include[0].where.automatic = isAutomatic;
  delete options.limit;
  delete options.order;
  delete options.group;
  const tableName: string =
    models.Recording.getTableName() as unknown as string;
  (models.Recording as any)._validateIncludedElements(options, {
    [tableName]: true,
  });
  return (models.Recording as any).queryGenerator
    .selectQuery(models.Recording.getTableName(), options, models.Recording)
    .replace(";", "");
};

export const getRawSqlUntagged = (models: ModelsDictionary, inOptions: any) => {
  const options = sequelize.Utils.cloneDeep(inOptions);
  delete options.include[0].include[0].where;
  delete options.limit;
  delete options.order;
  delete options.group;
  const tableName: string =
    models.Recording.getTableName() as unknown as string;
  (models.Recording as any)._validateIncludedElements(options, {
    [tableName]: true,
  });
  return (models.Recording as any).queryGenerator
    .selectQuery(models.Recording.getTableName(), options, models.Recording)
    .replace(";", "");
};

export const getSelfJoinForTagMode = (
  models: ModelsDictionary,
  options: (withTags: boolean) => any,
  tagMode: TagMode,
  taggedWith: string[],
  subClassTags: boolean,
  maxResults: number,
  offsetResults: number,
  count: boolean = false
) => {
  const limit = count
    ? ""
    : `limit ${Math.min(maxResults, 200)} ${
        offsetResults === 0 ? "" : `offset ${offsetResults}`
      }`;
  const recordingIds = (tableName: string) =>
    count ? `count(distinct ${tableName}.id)` : `distinct ${tableName}.id`;
  const whereTaggedWith = (tableName: string, tags: string[]) => {
    if (tags.length === 0) {
      return "";
    }
    return `and ${tableName}.what in (:taggedWith) ${
      subClassTags
        ? tags
            .map((_, index) => `or ${tableName}.path ~ :tag_${index}`)
            .join(" ")
        : ""
    }`;
  };
  switch (tagMode) {
    case TagMode.UnTagged: {
      // NOTE: Recordings that don't have any tracks,
      //  or have tracks that are somehow untagged by either AI or human taggers.
      const innerSql = getRawSqlUntagged(models, options(false));
      return `
        select ${recordingIds("untagged_recordings")}
        from 
        (${innerSql}) as untagged_recordings
        ${limit}        
      `;
    }
    case TagMode.HumanTagged: {
      // NOTE: Recordings that are tagged by a human (but can also be optionally tagged by AI).
      const innerSql = getRawSql(models, options(true), false);
      return `
        select ${recordingIds("human_tagged_recordings")}
        from    
        (${innerSql}) as human_tagged_recordings
        ${limit}                       
      `;
    }
    case TagMode.HumanOnly: {
      // NOTE: Recordings that are tagged by *only* a human.
      //  Query needs to check that there's not also an AI tag for this recording.
      const automaticSql = getRawSql(models, options(false), true);
      const humanSql = getRawSql(models, options(true), false);
      return `
        select ${recordingIds("human_only_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_only_recordings 
        on automatic_recordings.id = human_only_recordings.id 
        where 
        automatic_recordings.automatic is null and 
        human_only_recordings.automatic = false
        ${limit}            
      `;
    }
    case TagMode.AutomaticallyTagged: {
      // NOTE: Recordings that are tagged by an AI.  Can also be tagged by a human.
      // TODO: In the case where we're looking for a specific tag, if the AI tag was
      //  superseded by a different human tag, should the AI tag still get returned?
      const innerSql = getRawSql(models, options(true), true);
      return `
        select ${recordingIds("automatic_recordings")}
        from    
        (${innerSql}) as automatic_recordings     
        ${limit}             
      `;
    }
    case TagMode.AutomaticHumanUrlSafe: {
      // NOTE: Recordings that are tagged by *both* a human and an AI.
      //  The tags must agree (and in hierarchical mode, it's okay if one is an ancestor of the other)
      const automaticSql = getRawSql(models, options(true), true);
      const humanSql = getRawSql(models, options(false), false);
      return `
        select ${recordingIds("automatic_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id 
        where automatic_recordings.automatic = true 
        and human_recordings.automatic = false
        and (
          automatic_recordings.what = human_recordings.what or
          automatic_recordings.path @> human_recordings.path
        ) 
        ${whereTaggedWith("human_recordings", taggedWith)}
        ${limit}       
      `;
    }
    case TagMode.AutomaticOnly: {
      // NOTE: Recordings that are tagged by *only* an AI.
      //  Query needs to check that there's not also a human tag for this recording.
      // TODO: False-positive filtering?
      const automaticSql = getRawSql(models, options(true), true);
      const humanSql = getRawSql(models, options(true), false);
      return `
        select ${recordingIds("automatic_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id 
        where 
        automatic_recordings.automatic is true and 
        human_recordings.automatic is null
        ${limit}            
      `;
    }
    case TagMode.Tagged: {
      // NOTE: Recordings that are tagged by either of or both a human and AI.
      //  If we find recordings tagged by both, we need to make sure they both agree with the tag we're searching for,
      //  or that the human tag agrees and the AI tag didn't pass the tag filter (is null).
      const automaticSql = getRawSql(models, options(true), true);
      const humanSql = getRawSql(models, options(false), false);
      return `
        select ${recordingIds("automatic_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id 
        where (
        automatic_recordings.automatic = true 
        and human_recordings.automatic = false 
        and automatic_recordings.what = human_recordings.what 
        ${whereTaggedWith("human_recordings", taggedWith)}
        ) 
        or human_recordings.automatic is null                  
        ${limit}       
      `;
    }
    case TagMode.NoHuman: {
      // NOTE: Recordings that have either an AI tag, in the case where we're filtering on tags,
      //  or no tag or no track if we're not filtering on tags.
      const automaticSql = getRawSql(models, options(true), true);
      const humanSql = getRawSql(models, options(false), false);
      return `
        select ${recordingIds("automatic_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id 
        where
        (automatic_recordings.automatic = true
        or automatic_recordings.automatic is null
        ) 
        and human_recordings.automatic is null                                      
        ${limit}       
      `;
    }
    case TagMode.Any: {
      // NOTE: Any recordings, tagged or untagged – but not false-positive only/filtered by default.
      //  If filtering by tags, this won't get used – it will switch to using TagMode.Tagged
      const automaticSql = getRawSql(models, options(true), true);
      const humanSql = getRawSql(models, options(false), false);
      return `
        select ${recordingIds("automatic_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id                 
        ${limit}       
      `;
    }
    default: {
      throw new Error("Unknown case");
    }
  }
};

interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}
// Utils to output nicely formatted SQL to a web page to make query debugging easier.
export const sqlDebugOutput = (
  queryParams: ParsedQs,
  numResults: number,
  totalResults: number,
  queryTimes: number[],
  queriesSQL: string[],
  totalTime: number
): string => {
  const queryTime = queryTimes.reduce((acc, num) => acc + num, 0);
  return `
          <!DOCTYPE html>
          <body style="background-color: black">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>       
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
            <h1 style="color: white;">${numResults}/${totalResults} recordings, DB: ${queryTime}ms (${queryTimes.join(
    "ms, "
  )}ms), Sequelize: ${Math.round(totalTime - queryTime)}ms</h1>
            <pre style="background: black;" class="language-json theme-atom-one-dark"><code class="code">${JSON.stringify(
              queryParams,
              null,
              "\t"
            )}</code></pre>
            ${queriesSQL
              .map(
                (query) => `
            <div style="position: relative">
              <pre style="background: black;" class="language-sql theme-atom-one-dark"><code class="code">${query}</code></pre>
              <button class="btn" style="position: absolute; right: 20px; top: 20px;">Copy</button>
            </div>
            `
              )
              .join("")}
          </body>
          <script>
            hljs.highlightAll();
            const btns = document.querySelectorAll(".btn");
            const copyContent = async (text) => {
              try {
                await navigator.clipboard.writeText(text);               
              } catch (err) {
                console.error('Failed to copy to clipboard: ', err);
              }
            }
            for (const btn of btns) {
              btn.addEventListener("click", async (e) => {              
                const text = e.target.parentNode.querySelector(".code").innerText;               
                await copyContent(text);
              });
            }
          </script>
          </html>
        `;
};
