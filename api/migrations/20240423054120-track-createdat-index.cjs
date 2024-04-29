

module.exports = {
  up: function (queryInterface) {
    return queryInterface.addIndex("Tracks", {
      fields: ["createdAt"],
    },{order:'DESC'});
  },

  down: function (queryInterface) {
    return queryInterface.removeIndex("Tracks",["createdAt"]);
  },
};
