"use strict";

// Aliases in classification.json now get the same path as the label they are an alias
// of (eg. "rooster" -> "all.bird.chicken") so server-side queries group them with that
// label. Update existing TrackTag paths to match.
const newPaths = {
  "person": "all.mammal.human",
  "rabe": "all.mammal.rodent.rakali",
  "australian otter": "all.mammal.rodent.rakali",
  "water-rat": "all.mammal.rodent.rakali",
  "eurasian blackbird": "all.bird.blackbird",
  "rooster": "all.bird.chicken",
  "pīpipi": "all.bird.creeper.brown_creeper",
  "kārearea": "all.bird.falcon.new_zealand_falcon",
  "pīwakawaka": "all.bird.fantail.new_zealand_fantail",
  "european goldfinch": "all.bird.goldfinch",
  "european greenfinch": "all.bird.greenfinch",
  "kākā": "all.bird.kaka",
  "kererū": "all.bird.kereru",
  "roroa": "all.bird.kiwi.great_spotted_kiwi",
  "roa": "all.bird.kiwi.great_spotted_kiwi",
  "kiwi pukupuku": "all.bird.kiwi.little_spotted_kiwi",
  "rowi": "all.bird.kiwi.okarito_brown_kiwi",
  "tokoeka": "all.bird.kiwi.southern_brown_kiwi",
  "kōkako": "all.bird.kokako.north_island_kokako",
  "kōkā": "all.bird.kokako.south_island_kokako",
  "ruru": "all.bird.morepork",
  "tōrea tai": "all.bird.oystercatcher.chatham_island_oystercatcher",
  "tōrea": "all.bird.oystercatcher.south_island_pied_oystercatcher",
  "tōrea pango": "all.bird.oystercatcher.variable_oystercatcher",
  "common redpoll": "all.bird.redpoll",
  "tītitipounamu": "all.bird.rifleman",
  "toutouwai": "all.bird.robin.north_island_robin",
  "tauhou": "all.bird.silvereye",
  "european starling": "all.bird.starling.common_starling",
  "grey shrike-thrush": "all.bird.thrush.grey_shrikethrush",
  "tūī": "all.bird.tui",
};

// Paths these tags had before this change. null means the alias wasn't in
// label_paths.json, so it got the fallback path `all.<what>` with the first space
// replaced by an underscore.
const oldPaths = {
  "person": null,
  "rabe": null,
  "australian otter": null,
  "water-rat": null,
  "eurasian blackbird": "all.bird.blackbird.eurasian_blackbird",
  "rooster": "all.bird.rooster",
  "pīpipi": null,
  "kārearea": null,
  "pīwakawaka": null,
  "european goldfinch": "all.bird.goldfinch.european_goldfinch",
  "european greenfinch": "all.bird.greenfinch.european_greenfinch",
  "kākā": null,
  "kererū": null,
  "roroa": null,
  "roa": null,
  "kiwi pukupuku": null,
  "rowi": null,
  "tokoeka": null,
  "kōkako": null,
  "kōkā": null,
  "ruru": null,
  "tōrea tai": null,
  "tōrea": null,
  "tōrea pango": null,
  "common redpoll": "all.bird.redpoll.common_redpoll",
  "tītitipounamu": null,
  "toutouwai": null,
  "tauhou": null,
  "european starling": null,
  "grey shrike-thrush": null,
  "tūī": null,
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "TrackTags"
       SET "path" = text2ltree(:paths::jsonb ->> lower("what"))
       WHERE lower("what") IN (:whats)`,
      {
        replacements: {
          paths: JSON.stringify(newPaths),
          whats: Object.keys(newPaths),
        },
      },
    );
  },

  async down(queryInterface) {
    const known = Object.fromEntries(
      Object.entries(oldPaths).filter(([, path]) => path !== null),
    );
    const fallback = Object.keys(oldPaths).filter(
      (alias) => oldPaths[alias] === null,
    );
    await queryInterface.sequelize.query(
      `UPDATE "TrackTags"
       SET "path" = text2ltree(:paths::jsonb ->> lower("what"))
       WHERE lower("what") IN (:whats)`,
      {
        replacements: {
          paths: JSON.stringify(known),
          whats: Object.keys(known),
        },
      },
    );
    await queryInterface.sequelize.query(
      `UPDATE "TrackTags"
       SET "path" = text2ltree('all.' || regexp_replace(lower("what"), ' ', '_'))
       WHERE lower("what") IN (:whats)`,
      { replacements: { whats: fallback } },
    );
  },
};
