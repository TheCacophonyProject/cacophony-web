

module.exports = {
  up: async function (queryInterface) {
    // Remove unique constraint on username
    await queryInterface.sequelize.query(
      `alter table "Users" drop constraint "Users_username_key"`
    );
    // Add unique constraint on email
    await queryInterface.sequelize.query(
      `alter table "Users" add constraint "Users_email_key" unique (email)`
    );
    // Drop unused firstName, lastName columns
    await queryInterface.sequelize.query(
      `alter table "Users" drop column "firstName"`
    );
    await queryInterface.sequelize.query(
      `alter table "Users" drop column "lastName"`
    );

    // While we're at it, let's rename username to userName.
    await queryInterface.sequelize.query(
      `alter table "Users" rename column "username" to "userName"`
    );

    await queryInterface.sequelize.query(
      `alter table "Devices" rename column "devicename" to "deviceName"`
    );
    await queryInterface.sequelize.query(
      `alter table "Groups" rename column "groupname" to "groupName"`
    );
  },

  down: async function (queryInterface) {
    await queryInterface.sequelize.query(
      `alter table "Devices" rename column "deviceName" to "devicename"`
    );
    await queryInterface.sequelize.query(
      `alter table "Groups" rename column "groupName" to "groupname"`
    );
    await queryInterface.sequelize.query(
      `alter table "Users" rename column "userName" to "username"`
    );
    await queryInterface.sequelize.query(
      `alter table "Users" drop constraint "Users_email_key"`
    );
    await queryInterface.sequelize.query(
      `alter table "Users" add constraint "Users_username_key" unique (username)`
    );
    await queryInterface.sequelize.query(
      `alter table "Users" add "firstName" varchar(255) null;`
    );
    await queryInterface.sequelize.query(
      `alter table "Users" add "lastName" varchar(255) null;`
    );
  },
};
