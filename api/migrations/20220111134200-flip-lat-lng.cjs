

const flipCoordinates = async (queryInterface) => {
  // Update location, flip lat/lng to lng/lat
  for (const tableName of ["Devices", "Recordings", "Stations"]) {
    await queryInterface.sequelize.query(
      `update "${tableName}" set location = ST_FlipCoordinates(a.location) from (select location, id from "${tableName}" where location is not null) as a where "${tableName}".id = a.id`
    );
  }
};

module.exports = {
  up: async function (queryInterface) {
    await flipCoordinates(queryInterface);
  },

  down: async function (queryInterface) {
    await flipCoordinates(queryInterface);
  },
};
