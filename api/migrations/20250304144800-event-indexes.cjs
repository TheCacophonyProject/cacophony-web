module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("Events", ["EventDetailId"], {
      name: "events_eventdetailid_idx",
    });
    await queryInterface.addIndex("DetailSnapshots", ["type"], {
      name: "detailsnapshots_type_idx",
    });

    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS events_datetime
    `);
    await queryInterface.addIndex(
      "Events",
      {
        fields: ["dateTime"],
        name: "events_datetime_idx",
      },
      { order: "DESC" }
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS events_eventdetailid_idx
    `);
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS detailsnapshots_type_idx
    `);
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS events_datetime_idx
    `);
    await queryInterface.addIndex("Events", ["dateTime"], {
      name: "events_datetime",
    });
  },
};
