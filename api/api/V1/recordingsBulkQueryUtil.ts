import type { RecordingProcessingState } from "@typedefs/api/consts.js";
import { TagMode, RecordingType } from "@typedefs/api/consts.js";
import type {
  DeviceId,
  GroupId,
  RecordingId,
  StationId,
} from "@typedefs/api/common.js";
import { Op, QueryTypes } from "sequelize";
import Sequelize from "sequelize";
import { Recording } from "@models/Recording.js";
import { Track } from "@models/Track.js";
import { TrackTag } from "@models/TrackTag.js";
import { Tag } from "@models/Tag.js";
import { ParsedQs } from "qs";

export const getFirstPass = (
  sequelize: Sequelize.Sequelize,
  projectId: GroupId,
  minDuration: number,
  statusRecordingsOnly: boolean,
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
  direction: "ASC" | "DESC" = "DESC",
): Sequelize.FindOptions => {
  const requiresTags = [
    TagMode.HumanTagged,
    TagMode.AutomaticallyTagged,
    TagMode.AutomaticHumanUrlSafe,
  ].includes(tagMode);
  const isHumanOnlyTagMode = [TagMode.HumanOnly].includes(tagMode);
  return {
    where: {
      ...(includeDeletedRecordings
        ? {}
        : {
            deletedAt: { [Op.eq]: null },
          }),
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
      ...(types.includes(RecordingType.Audio) && !includeFilteredTracks
        ? { redacted: false }
        : {}),
      // NOTE: If minDuration is zero, don't include this clause
      ...(minDuration !== 0
        ? {
            duration: statusRecordingsOnly
              ? { [Op.and]: [{ [Op.lt]: 2.5 }, { [Op.gt]: 0.0 }] }
              : { [Op.gte]: minDuration },
          }
        : {}),
      [Op.and]: [
        ...(tagMode === TagMode.UnTagged
          ? [
              {
                [Op.or]: [
                  sequelize.where(sequelize.col(`"Tracks".id`), Op.eq, null),
                  sequelize.where(
                    sequelize.col(`"Tracks->TrackTags".id`),
                    Op.eq,
                    null,
                  ),
                ],
              },
            ]
          : taggedWith.length !== 0 && withTags
            ? [
                {
                  [Op.or]: [
                    sequelize.where(sequelize.col(`"Tracks->TrackTags".what`), {
                      [Op.in]: taggedWith,
                    }),
                    ...(subClassTags
                      ? taggedWith.map((tag) =>
                          sequelize.where(
                            sequelize.col('"Tracks->TrackTags".path'),
                            "~",
                            `*.${tag.replace(/-/g, "_")}.*`,
                          ),
                        )
                      : []),
                  ],
                },
              ]
            : []),
        ...(labelledWith.length !== 0
          ? [
              sequelize.where(sequelize.col(`"Tags".detail`), {
                [Op.in]: labelledWith,
              }),
            ]
          : []),
        ...(!includeFilteredTracks && !requiresTags
          ? [
              sequelize.where(sequelize.col(`"Tracks".filtered`), {
                [Op.eq]: false,
              }),
            ]
          : []),
      ],
    },
    include: [
      {
        model: Track,
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
            model: TrackTag,
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
              model: Tag,
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
      // FIXME: Make sure these aliases are correct in the generated SQL.
      [Sequelize.col(`"Tracks->TrackTags".automatic`), "automatic"],
      [Sequelize.col(`"Tracks->TrackTags".what`), "what"],
      [Sequelize.col(`"Tracks->TrackTags".path`), "path"],
    ],
    order: [["recordingDateTime", direction as string]],
  };
};

const getRawSql = (options: Sequelize.FindOptions) => {
  const tableName: string = Recording.getTableName() as unknown as string;
  if (
    "_validateIncludedElements" in Recording &&
    typeof Recording._validateIncludedElements === "function"
  ) {
    Recording._validateIncludedElements(options, {
      [tableName]: true,
    });
  }
  if (
    "queryGenerator" in Recording &&
    "selectQuery" in (Recording as { queryGenerator: object }).queryGenerator &&
    typeof (Recording.queryGenerator as { selectQuery: unknown })
      .selectQuery === "function"
  ) {
    return (
      Recording as {
        queryGenerator: {
          selectQuery: (
            name:
              | string
              | {
                  tableName: string;
                  schema: string;
                  delimiter: string;
                },
            options: unknown,
            rec: Recording,
          ) => string;
        };
      }
    ).queryGenerator
      .selectQuery(
        Recording.getTableName(),
        options,
        Recording as unknown as Recording,
      )
      .replace(";", "");
  }
};

export const getSelfJoinForTagMode = (
  options: (
    withTags: boolean,
    automatic: boolean | null,
  ) => Sequelize.FindOptions,
  tagMode: TagMode,
  taggedWith: string[],
  subClassTags: boolean,
  maxResults: number,
  includeFilteredTracks: boolean,
  direction: "ASC" | "DESC" = "DESC",
) => {
  const limit = (tableName?: string) => {
    if (!tableName) {
      return `
        order by "recordingDateTime" ${direction}
        limit ${maxResults}`;
    }
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
      const innerSql = getRawSql(options(false, null));
      return `
        select ${recordingIds("untagged_recordings")}
        from 
        (${innerSql}) as untagged_recordings
        ${limit("untagged_recordings")}        
      `;
    }
    case TagMode.HumanTagged: {
      // NOTE: Recordings that are tagged by a human (but can also be optionally tagged by AI).
      const innerSql = getRawSql(options(true, false));
      return `
        select ${recordingIds("human_tagged_recordings")}
        from    
        (${innerSql}) as human_tagged_recordings
        ${limit("human_tagged_recordings")}                       
      `;
    }
    case TagMode.HumanOnly: {
      // NOTE: Recordings that are tagged by *only* a human.
      //  FIXME: Query needs to check that there's not also an AI tag for this recording.
      const automaticSql = getRawSql(options(false, true));
      const humanSql = getRawSql(options(true, false));
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
      const innerSql = getRawSql(options(true, true));
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
      const automaticSql = getRawSql(options(true, true));
      const humanSql = getRawSql(options(false, false));
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
      // TODO: False-positive filtering?
      const automaticSql = getRawSql(options(true, true));
      const humanSql = getRawSql(options(true, false));

      return `with all_recs as (
        select 
          distinct(automatic_recordings.id),
          automatic_recordings.automatic as automatic,
          not human_recordings.automatic as human,
          automatic_recordings."recordingDateTime"
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id)
        select ${recordingIds("t1")} from all_recs t1
          where not exists (
            select 1 from all_recs t2 where t1.id = t2.id and t2.human = true 
          )
          ${limit("t1")}`;
    }
    case TagMode.Tagged: {
      // NOTE: Recordings that are tagged by either of or both a human and AI.
      //  If we find recordings tagged by both, we need to make sure they both agree with the tag we're searching for,
      //  or that the human tag agrees and the AI tag didn't pass the tag filter (is null).
      const automaticSql = getRawSql(options(true, true));
      const humanSql = getRawSql(options(false, false));
      return `
        select distinct 
          coalesce(
            automatic_recordings.id, 
            human_recordings.id
          ) as id,
	      coalesce (
	        automatic_recordings."recordingDateTime", 
	        human_recordings."recordingDateTime"
          ) as "recordingDateTime" 
        from 
        (${automaticSql}) as automatic_recordings 
        full join 
        (${humanSql}) as human_recordings 
        on human_recordings.id = automatic_recordings.id 
        where (
        automatic_recordings.automatic = true 
        and human_recordings.automatic = false 
        and automatic_recordings.what = human_recordings.what 
        ${whereTaggedWith("human_recordings", taggedWith)}
        ) 
        or human_recordings.automatic is null                  
        ${limit()}       
      `;
    }
    case TagMode.NoHuman: {
      // NOTE: Recordings that have either an AI tag, in the case where we're filtering on tags,
      //  or no tag or no track if we're not filtering on tags.
      const automaticSql = getRawSql(options(true, true));
      const humanSql = getRawSql(options(false, false));
      return `
        with all_recs as (
        select 
          distinct(automatic_recordings.id),
          automatic_recordings.automatic as automatic,
          not human_recordings.automatic as human,
          automatic_recordings."recordingDateTime"
        from 
        (${automaticSql}) as automatic_recordings 
        left join 
        (${humanSql}) as human_recordings 
        on automatic_recordings.id = human_recordings.id)
        select ${recordingIds("t1")} from all_recs t1
          where not exists (
            select 1 from all_recs t2 where t1.id = t2.id and t2.human = true
          )
          ${limit("t1")}
      `;
    }
    case TagMode.Any: {
      // NOTE: Any recordings, tagged or untagged – but not false-positive only/filtered by default.
      //  If filtering by tags, this won't get used – it will switch to using TagMode.Tagged

      if (!includeFilteredTracks) {
        // TODO: Improve this query, since it doesn't really need the left join as we're not checking tags - although we
        //  are filtering false positives
        const automaticSql = getRawSql(options(true, true));
        const humanSql = getRawSql(options(false, false));
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
        const sql = getRawSql(options(false, null));
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

// Utils to output nicely formatted SQL to a web page to make query debugging easier.
export const sqlDebugOutput = (
  queryParams: ParsedQs,
  numResults: number,
  queryTimes: number[],
  queriesSQL: string[],
  totalTime: number,
  records?: unknown[],
): string => {
  const queryTime = queryTimes.reduce((acc, num) => acc + num, 0);

  let recordsOutput = "";
  if (records) {
    recordsOutput = `
    <pre style="background: black;" class="language-json theme-atom-one-dark"><code class="code">${JSON.stringify(
      records,
      null,
      "\t",
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
              "ms, ",
            )}ms), Sequelize: ${Math.round(totalTime - queryTime)}ms</h1>
            <pre style="background: black;" class="language-json theme-atom-one-dark"><code class="code">${JSON.stringify(
              queryParams,
              null,
              "\t",
            )}</code></pre>     
            ${recordsOutput}    
            ${queriesSQL
              .map(
                (query, index) => `
            <div style="position: relative">
              <pre style="background: black;" class="language-sql theme-atom-one-dark"><code class="code">${query}</code></pre>
              <button class="btn" style="position: absolute; right: 20px; top: 20px;">Copy (${queryTimes[index]}ms)</button>
            </div>
            `,
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
  sequelize: Sequelize.Sequelize,
  projectId: GroupId,
  minDuration: number,
  statusRecordingsOnly: boolean,
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
  direction: "DESC" | "ASC" = "DESC",
): Promise<{ id: RecordingId; recordingDateTime: Date }[]> => {
  const tagged = tagMode !== TagMode.UnTagged && taggedWith.length !== 0;
  const labelled = labelledWith.length !== 0;
  const firstPass = (withTags: boolean, automatic: boolean) =>
    getFirstPass(
      sequelize,
      projectId,
      minDuration,
      statusRecordingsOnly,
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
      direction,
    );
  const tagReplacements: Record<string, string> = {};
  for (let i = 0; i < taggedWith.length; i++) {
    tagReplacements[`tag_${i}`] = `*.${taggedWith[i].replace(/-/g, "_")}.*`;
  }
  const recordings = await sequelize.query(
    getSelfJoinForTagMode(
      firstPass,
      tagMode,
      taggedWith,
      subClassTags,
      limit,
      includeFilteredTracks,
      direction,
    ),
    {
      logging,
      type: QueryTypes.SELECT,
      replacements: { taggedWith, ...tagReplacements },
    },
  );
  return (recordings as { id: RecordingId; recordingDateTime: Date }[]).map(
    ({ id, recordingDateTime }) => ({
      id,
      recordingDateTime: new Date(recordingDateTime),
    }),
  );
};
