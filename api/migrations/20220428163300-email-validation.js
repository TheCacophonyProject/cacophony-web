"use strict";

module.exports = {
  up: async function (queryInterface, Sequelize) {
    // Stations get a start date, allowing null for now
    await queryInterface.addColumn("Users", "emailConfirmed", {
      type: Sequelize.BOOLEAN,
      comment: "Set if user has confirmed their email address via a sent link",
      defaultValue: false,
      allowNull: false,
    });

    await queryInterface.addColumn("Users", "lastActiveAt", {
      type: Sequelize.DATE,
      allowNull: true,
      comment:
        "Updated any time a user logs in, or refreshes their session token",
    });

    await queryInterface.createTable("UserSessions", {
      refreshToken: {
        type: Sequelize.STRING,
        allowNull: false,
        comment:
          "A unique, one-time-usable token that allows a user to refresh their session JWT token",
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "User id of user",
      },
      userAgent: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "User agent string for this session",
      },
      viewport: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Device screen metrics for analytics purposes",
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  down: async function (queryInterface) {
    await queryInterface.removeColumn("Users", "emailConfirmed");
    await queryInterface.removeColumn("Users", "lastActiveAt");
    await queryInterface.dropTable("UserSessions");
  },
};
