import type { RecordingProcessingState } from "@typedefs/api/consts.js";
import { RecordingType, TagMode } from "@typedefs/api/consts.js";
import type {
  DeviceId,
  GroupId,
  RecordingId,
  StationId,
} from "@typedefs/api/common.js";
import sequelize, { Op, QueryTypes } from "sequelize";
import type { ModelsDictionary } from "@models";

export const getFirstPass = (
  models: ModelsDictionary,
  projectId: GroupId,
  minDuration: number,
  includeDeletedRecordings: boolean,
  types: RecordingType[],
  processingState: RecordingProcessingState | undefined,
  devices: DeviceId[],
  locations: StationId[],
  withTags: boolean,
  taggedWith: string[],
  subClassTags: boolean,
  labelledWith: string[],
  tagged: boolean,
  labelled: boolean,
  tagMode: TagMode,
  includeFilteredTracks: boolean,
  automatic: boolean | null,
  from: Date | undefined,
  until: Date | undefined,
  direction: "asc" | "desc" = "desc"
) => {
  const requiresTags = [
    TagMode.HumanTagged,
    TagMode.AutomaticallyTagged,
    TagMode.AutomaticHumanUrlSafe,
  ].includes(tagMode);
  const isHumanOnlyTagMode = [TagMode.HumanOnly].includes(tagMode);
  return {
    where: {
      ...(includeDeletedRecordings ? {} : { deletedAt: { [Op.eq]: null } }),
      ...(types.length !== 0 ? { type: { [Op.in]: types } } : {}),
      ...(processingState !== undefined ? { processingState } : {}),
      ...(devices.length !== 0 ? { DeviceId: { [Op.in]: devices } } : {}),
      ...(locations.length !== 0 ? { StationId: { [Op.in]: locations } } : {}),
      ...(from || until
        ? from && until
          ? {
              recordingDateTime: {
                [Op.and]: [{ [Op.gte]: from }, { [Op.lt]: until }],
              },
            }
          : from
          ? { recordingDateTime: { [Op.gte]: from } }
          : { recordingDateTime: { [Op.lt]: until } }
        : {}),
      GroupId: projectId,
      ...(types.includes(RecordingType.Audio) ? { redacted: false } : {}),
      duration: { [Op.gte]: minDuration },
      [Op.and]: [
        ...(tagMode === TagMode.UnTagged
          ? [
              {
                [Op.or]: [
                  sequelize.where(sequelize.col('"Tracks".id'), Op.eq, null),
                  sequelize.where(
                    sequelize.col('"Tracks->TrackTags".id'),
                    Op.eq,
                    null
                  ),
                ],
              },
            ]
          : taggedWith.length !== 0 && withTags
          ? [
              {
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
              },
            ]
          : []),
        ...(labelledWith.length !== 0
          ? [
              sequelize.where(sequelize.col('"Tags".detail'), {
                [Op.in]: labelledWith,
              }),
            ]
          : []),
        ...(!includeFilteredTracks && !requiresTags
          ? [
              sequelize.where(sequelize.col('"Tracks".filtered'), {
                [Op.eq]: false,
              }),
            ]
          : []),
      ],
    },
    include: [
      {
        model: models.Track,
        attributes: [],
        required: (tagged || requiresTags) && !isHumanOnlyTagMode,
        where: {
          archivedAt: {
            [Op.is]: null,
          },
          ...(!includeFilteredTracks && !requiresTags && { filtered: false }),
        },
        include: [
          {
            model: models.TrackTag,
            attributes: [],
            subQuery: false,
            required: (tagged || requiresTags) && !isHumanOnlyTagMode,
            include: [],
            ...(tagMode !== TagMode.UnTagged
              ? {
                  where: {
                    used: true,
                    archivedAt: {
                      [Op.is]: null,
                    },
                    ...(!includeFilteredTracks && {
                      what: { [Op.ne]: "false-positive" },
                    }),
                    ...(automatic !== null ? { automatic } : {}),
                  },
                }
              : {}),
          },
        ],
      },
      ...(labelled
        ? [
            {
              model: models.Tag,
              attributes: [],
              required: true,
            },
          ]
        : []),
    ],
    // NOTE: Turning off sub-queries here and forcing an inner join is important, as it makes queries > 10X faster.
    // Also note that this means we won't get back our `limit` recordings but it's better to do lots of smaller
    // fast incremental date range queries on the front-end rather than blocking on longer queries.
    subQuery: false,
    attributes: [
      "id",
      "recordingDateTime",
      sequelize.col('"Tracks->TrackTags".automatic'),
      sequelize.col('"Tracks->TrackTags".what'),
      sequelize.col('"Tracks->TrackTags".path'),
    ],
    order: [["recordingDateTime", direction]],
  };
};

const getRawSql = (models: ModelsDictionary, options: any) => {
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
  options: (withTags: boolean, automatic: boolean | null) => any,
  tagMode: TagMode,
  taggedWith: string[],
  subClassTags: boolean,
  maxResults: number,
  includeFilteredTracks: boolean,
  direction: "asc" | "desc" = "desc"
) => {
  const limit = (tableName: string) => {
    return `
        order by ${tableName}."recordingDateTime" ${direction}
        limit ${maxResults}`;
  };
  const recordingIds = (tableName: string) =>
    `distinct ${tableName}.id, ${tableName}."recordingDateTime"`;
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
      const innerSql = getRawSql(models, options(false, null));
      return `
        select ${recordingIds("untagged_recordings")}
        from 
        (${innerSql}) as untagged_recordings
        ${limit("untagged_recordings")}        
      `;
    }
    case TagMode.HumanTagged: {
      // NOTE: Recordings that are tagged by a human (but can also be optionally tagged by AI).
      const innerSql = getRawSql(models, options(true, false));
      return `
        select ${recordingIds("human_tagged_recordings")}
        from    
        (${innerSql}) as human_tagged_recordings
        ${limit("human_tagged_recordings")}                       
      `;
    }
    case TagMode.HumanOnly: {
      // NOTE: Recordings that are tagged by *only* a human.
      //  Query needs to check that there's not also an AI tag for this recording.
      const automaticSql = getRawSql(models, options(false, true));
      const humanSql = getRawSql(models, options(true, false));
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
        ${limit("human_only_recordings")}            
      `;
    }
    case TagMode.AutomaticallyTagged: {
      // NOTE: Recordings that are tagged by an AI.  Can also be tagged by a human.
      // TODO: In the case where we're looking for a specific tag, if the AI tag was
      //  superseded by a different human tag, should the AI tag still get returned?
      const innerSql = getRawSql(models, options(true, true));
      return `
        select ${recordingIds("automatic_recordings")}
        from    
        (${innerSql}) as automatic_recordings     
        ${limit("automatic_recordings")}             
      `;
    }
    case TagMode.AutomaticHumanUrlSafe: {
      // NOTE: Recordings that are tagged by *both* a human and an AI.
      //  The tags must agree (and in hierarchical mode, it's okay if one is an ancestor of the other)
      const automaticSql = getRawSql(models, options(true, true));
      const humanSql = getRawSql(models, options(false, false));
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
        ${limit("automatic_recordings")}       
      `;
    }
    case TagMode.AutomaticOnly: {
      // NOTE: Recordings that are tagged by *only* an AI.
      //  Query needs to check that there's not also a human tag for this recording.
      // TODO: False-positive filtering?
      const automaticSql = getRawSql(models, options(true, true));
      const humanSql = getRawSql(models, options(true, false));
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
        ${limit("automatic_recordings")}            
      `;
    }
    case TagMode.Tagged: {
      // NOTE: Recordings that are tagged by either of or both a human and AI.
      //  If we find recordings tagged by both, we need to make sure they both agree with the tag we're searching for,
      //  or that the human tag agrees and the AI tag didn't pass the tag filter (is null).
      const automaticSql = getRawSql(models, options(true, true));
      const humanSql = getRawSql(models, options(false, false));
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
        ${limit("automatic_recordings")}       
      `;
    }
    case TagMode.NoHuman: {
      // NOTE: Recordings that have either an AI tag, in the case where we're filtering on tags,
      //  or no tag or no track if we're not filtering on tags.
      const automaticSql = getRawSql(models, options(true, true));
      const humanSql = getRawSql(models, options(false, false));
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
        ${limit("automatic_recordings")}       
      `;
    }
    case TagMode.Any: {
      // NOTE: Any recordings, tagged or untagged – but not false-positive only/filtered by default.
      //  If filtering by tags, this won't get used – it will switch to using TagMode.Tagged

      // TODO: Improve this query, since it doesn't really need the left join as we're not checking tags - although we
      //  are filtering false positives
      if (!includeFilteredTracks) {
        const automaticSql = getRawSql(models, options(true, true));
        const humanSql = getRawSql(models, options(false, false));
        return `
        select ${recordingIds("automatic_recordings")} 
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id                 
        ${limit("automatic_recordings")}       
      `;
      } else {
        // TODO: keep this?
        const sql = getRawSql(models, options(false, null));
        return `
        select ${recordingIds("all_recordings")} 
        from 
        (${sql}) as all_recordings                
        ${limit("all_recordings")}
        `;
      }
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
  queryTimes: number[],
  queriesSQL: string[],
  totalTime: number,
  records?: any[]
): string => {
  const queryTime = queryTimes.reduce((acc, num) => acc + num, 0);

  let recordsOutput = "";
  if (records) {
    recordsOutput = `
    <pre style="background: black;" class="language-json theme-atom-one-dark"><code class="code">${JSON.stringify(
      records,
      null,
      "\t"
    )}</code></pre>
    `;
  }

  return `
          <!DOCTYPE html>
          <body style="background-color: black">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>       
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
            <h1 style="color: white;">${numResults} recordings, DB: ${queryTime}ms (${queryTimes.join(
    "ms, "
  )}ms), Sequelize: ${Math.round(totalTime - queryTime)}ms</h1>
            <pre style="background: black;" class="language-json theme-atom-one-dark"><code class="code">${JSON.stringify(
              queryParams,
              null,
              "\t"
            )}</code></pre>     
            ${recordsOutput}    
            ${queriesSQL
              .map(
                (query, index) => `
            <div style="position: relative">
              <pre style="background: black;" class="language-sql theme-atom-one-dark"><code class="code">${query}</code></pre>
              <button class="btn" style="position: absolute; right: 20px; top: 20px;">Copy (${queryTimes[index]}ms)</button>
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

export const queryRecordingsInProject = async (
  models: ModelsDictionary,
  projectId: GroupId,
  minDuration: number,
  includeDeletedRecordings: boolean,
  types: RecordingType[],
  processingState: RecordingProcessingState | undefined,
  devices: DeviceId[],
  locations: StationId[],
  taggedWith: string[],
  subClassTags: boolean,
  labelledWith: string[],
  tagMode: TagMode,
  includeFilteredTracks: boolean,
  limit: number,
  fromDate: Date | undefined,
  untilDate: Date | undefined,
  logging: (message: string, time: number) => void,
  direction: "desc" | "asc" = "desc"
): Promise<{ id: RecordingId; recordingDateTime: Date }[]> => {
  const tagged = tagMode !== TagMode.UnTagged && taggedWith.length !== 0;
  const labelled = labelledWith.length !== 0;
  const firstPass = (withTags: boolean, automatic: boolean) =>
    getFirstPass(
      models,
      projectId,
      minDuration,
      includeDeletedRecordings,
      types,
      processingState,
      devices,
      locations,
      withTags,
      taggedWith,
      subClassTags,
      labelledWith,
      tagged,
      labelled,
      tagMode,
      includeFilteredTracks,
      automatic,
      fromDate,
      untilDate,
      direction
    );
  const tagReplacements = {};
  for (let i = 0; i < taggedWith.length; i++) {
    tagReplacements[`tag_${i}`] = `*.${taggedWith[i].replace(/-/g, "_")}.*`;
  }
  const recordings = await models.sequelize.query(
    getSelfJoinForTagMode(
      models,
      firstPass,
      tagMode,
      taggedWith,
      subClassTags,
      limit,
      includeFilteredTracks,
      direction
    ),
    {
      logging,
      type: QueryTypes.SELECT,
      replacements: { taggedWith, ...tagReplacements },
    }
  );
  return (recordings as { id: RecordingId; recordingDateTime: Date }[]).map(
    ({ id, recordingDateTime }) => ({
      id,
      recordingDateTime: new Date(recordingDateTime),
    })
  );
};
