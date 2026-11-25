"use strict";

// kangaroo, grey kangaroo and wallaby moved under a new "macropod" parent label,
// and bandicoot moved from bird to mammal. Also fixes slender-billed white-eye,
// which label_paths.json wrongly had under silvereye. Update existing TrackTag paths to match.
const newPaths = {
  kangaroo: "all.mammal.macropod.kangaroo",
  "grey kangaroo": "all.mammal.macropod.kangaroo.grey_kangaroo",
  wallaby: "all.mammal.macropod.wallaby",
  bandicoot: "all.mammal.bandicoot",
  "slender-billed white-eye": "all.bird.slenderbilled_whiteeye",
};

// Paths these tags had before this change (kangaroo, grey kangaroo and bandicoot
// were missing from label_paths.json, so they got the fallback `all.<what>` path).
const oldPaths = {
  kangaroo: "all.kangaroo",
  "grey kangaroo": "all.grey_kangaroo",
  wallaby: "all.mammal.wallaby",
  bandicoot: "all.bandicoot",
  "slender-billed white-eye": "all.bird.silvereye.slenderbilled_whiteeye",
};

const setPaths = async (queryInterface, paths) => {
  await queryInterface.sequelize.query(
    `UPDATE "TrackTags"
     SET "path" = text2ltree(:paths::jsonb ->> lower("what"))
     WHERE lower("what") IN (:whats)`,
    {
      replacements: {
        paths: JSON.stringify(paths),
        whats: Object.keys(paths),
      },
    },
  );
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await setPaths(queryInterface, newPaths);
  },

  async down(queryInterface) {
    await setPaths(queryInterface, oldPaths);
  },
};
